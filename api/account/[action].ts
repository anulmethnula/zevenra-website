import type {VercelRequest,VercelResponse} from '@vercel/node';
import {randomUUID} from 'node:crypto';
import {
  appsScriptEnv,
  body,
  callScript,
  customerCookie,
  customerLoginSchema,
  customerProfileSchema,
  customerRegisterSchema,
  hashCustomerPassword,
  json,
  makeCustomerSession,
  methodNotAllowed,
  readCustomerSession,
  validOrigin,
  verifyCustomerPassword,
  type CustomerRecord,
} from '../_shared.js';

type RouteHandler = {
  methods: readonly string[];
  run: (req: VercelRequest, res: VercelResponse) => Promise<VercelResponse>;
};

const ROUTES: Record<string, RouteHandler> = {
  register: {
    methods: ['POST'],
    async run(req: VercelRequest, res: VercelResponse) {
      const config = appsScriptEnv();
      if (!validOrigin(req, config)) return json(res, {error: 'Invalid request origin'}, 403);
      const input = customerRegisterSchema.parse(body(req));
      const {passwordHash, passwordSalt} = await hashCustomerPassword(input.password);
      const now = new Date().toISOString();
      const customer = await callScript(config, 'createCustomer', {
        id: randomUUID(),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        mobile: input.mobile || '',
        passwordHash,
        passwordSalt,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      }) as CustomerRecord;
      const secret = process.env.CUSTOMER_SESSION_SECRET;
      if (!secret) throw new Error('CUSTOMER_CONFIG');
      res.setHeader('Set-Cookie', customerCookie(makeCustomerSession(secret, {id: customer.id, email: customer.email})));
      return json(res, {user: safeCustomer(customer)}, 201);
    },
  },
  login: {
    methods: ['POST'],
    async run(req: VercelRequest, res: VercelResponse) {
      const config = appsScriptEnv();
      if (!validOrigin(req, config)) return json(res, {error: 'Invalid request origin'}, 403);
      const input = customerLoginSchema.parse(body(req));
      const customer = await callScript(config, 'getCustomerByEmail', {email: input.email}) as CustomerRecord | null;
      let valid = false;
      if (customer) {
        valid = customer.status === 'active' && await verifyCustomerPassword(input.password, String(customer.passwordHash || ''), String(customer.passwordSalt || ''));
      } else {
        await hashCustomerPassword(input.password, 'invalid-customer-fixed-salt');
      }
      if (!customer || !valid) return json(res, {error: 'Invalid email or password.'}, 401);
      await callScript(config, 'updateCustomerLastLogin', {id: customer.id, lastLoginAt: new Date().toISOString()});
      const secret = process.env.CUSTOMER_SESSION_SECRET;
      if (!secret) throw new Error('CUSTOMER_CONFIG');
      res.setHeader('Set-Cookie', customerCookie(makeCustomerSession(secret, {id: customer.id, email: customer.email})));
      return json(res, {user: safeCustomer(customer)});
    },
  },
  logout: {
    methods: ['POST'],
    async run(req: VercelRequest, res: VercelResponse) {
      const config = appsScriptEnv();
      if (!validOrigin(req, config)) return json(res, {error: 'Invalid request origin'}, 403);
      res.setHeader('Set-Cookie', customerCookie('', 0));
      return json(res, {ok: true});
    },
  },
  session: {
    methods: ['GET'],
    async run(req: VercelRequest, res: VercelResponse) {
      const identity = readCustomerSession(req);
      if (!identity) return json(res, {user: null});
      const customer = await callScript(appsScriptEnv(), 'getCustomerById', {id: identity.id}) as CustomerRecord | null;
      if (!customer || customer.status !== 'active') return json(res, {user: null});
      return json(res, {user: safeCustomer(customer)});
    },
  },
  profile: {
    methods: ['GET', 'POST'],
    async run(req: VercelRequest, res: VercelResponse) {
      const config = appsScriptEnv();
      const identity = readCustomerSession(req, req.method === 'POST');
      if (!identity) return json(res, {user: null});
      if (req.method === 'POST') {
        if (!validOrigin(req, config)) return json(res, {error: 'Invalid request origin'}, 403);
        const input = customerProfileSchema.parse(body(req));
        const customer = await callScript(config, 'updateCustomerProfile', {
          id: identity.id,
          firstName: input.firstName,
          lastName: input.lastName,
          mobile: input.mobile || '',
          address1: input.address1 || '',
          address2: input.address2 || '',
          city: input.city || '',
          district: input.district || '',
          postalCode: input.postalCode || '',
        }) as CustomerRecord;
        return json(res, {user: safeCustomer(customer)});
      }
      const customer = await callScript(config, 'getCustomerById', {id: identity.id}) as CustomerRecord | null;
      if (!customer || customer.status !== 'active') return json(res, {user: null});
      return json(res, {user: safeCustomer(customer)});
    },
  },
  orders: {
    methods: ['GET'],
    async run(req: VercelRequest, res: VercelResponse) {
      const config = appsScriptEnv();
      const identity = readCustomerSession(req, true);
      if (!identity) throw new Error('CUSTOMER_AUTH_REQUIRED');
      const rows = await callScript(config, 'listCustomerOrders', {customerId: identity.id, email: identity.email}) as Array<{orderId?: unknown; createdAt?: unknown; paymentMethod?: unknown; subtotal?: unknown; deliveryFee?: unknown; total?: unknown; orderStatus?: unknown; items?: Array<{variantId?: unknown; productName?: unknown; color?: unknown; size?: unknown; quantity?: unknown; unitPrice?: unknown; lineTotal?: unknown}>}>;
      const safeOrders = (Array.isArray(rows) ? rows : []).map((order) => ({
        orderId: String(order.orderId || ''),
        createdAt: String(order.createdAt || ''),
        paymentMethod: order.paymentMethod === 'bank' ? 'bank' : 'cod',
        subtotal: Number(order.subtotal) || 0,
        deliveryFee: Number(order.deliveryFee) || 0,
        total: Number(order.total) || 0,
        orderStatus: normalizeStatus(order.orderStatus),
        items: (Array.isArray(order.items) ? order.items : []).map((item) => ({
          variantId: String(item.variantId || ''),
          name: String(item.productName || ''),
          color: String(item.color || ''),
          size: String(item.size || ''),
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          subtotal: Number(item.lineTotal) || 0,
        })),
      }));
      return json(res, safeOrders);
    },
  },
} as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const value = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const action = String(value || '');
  const route = ROUTES[action];
  if (!route) return json(res, {error: 'Unknown action'}, 404);
  if (!route.methods.includes(req.method || '')) {
    res.setHeader('Allow', [...route.methods].join(', '));
    return json(res, {error: 'Method not allowed'}, 405);
  }
  try {
    return await route.run(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'CUSTOMER_EXISTS') return json(res, {error: 'An account already exists with this email.'}, 409);
    if (error instanceof Error && error.name === 'ZodError') {
      const isLogin = action === 'login';
      return json(res, {error: isLogin ? 'Invalid email or password.' : 'Please review your account information.'}, isLogin ? 401 : 400);
    }
    if (message.startsWith('CUSTOMER_AUTH_')) return json(res, {error: 'Authentication required.'}, 401);
    if (action === 'login') return json(res, {error: 'Unable to sign in right now.'}, 500);
    if (action === 'register') return json(res, {error: 'We could not create your account right now.'}, 500);
    if (action === 'logout') return json(res, {error: 'Unable to sign out.'}, 500);
    if (action === 'orders') return json(res, {error: 'Orders are temporarily unavailable.'}, 500);
    return json(res, {error: 'The request could not be completed.'}, 500);
  }
}

function safeCustomer(customer: CustomerRecord) {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    mobile: customer.mobile || '',
    address1: customer.address1 || '',
    address2: customer.address2 || '',
    city: customer.city || '',
    district: customer.district || '',
    postalCode: customer.postalCode || '',
  };
}

function normalizeStatus(value: unknown) {
  const normalized = String(value || 'pending').toLowerCase();
  const allowed = ['pending', 'confirmed', 'sourcing', 'packed', 'shipped', 'delivered', 'cancelled'];
  return allowed.includes(normalized) ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Pending';
}
