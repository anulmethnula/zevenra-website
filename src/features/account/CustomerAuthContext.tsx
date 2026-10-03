import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CustomerUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  address1: string;
  address2: string;
  city: string;
  district: string;
  postalCode: string;
};
type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  mobile?: string;
};
export type CustomerProfileUpdate = {
  firstName: string;
  lastName: string;
  mobile?: string;
  address1?: string;
  address2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
};
type CustomerAuth = {
  user: CustomerUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (data: Registration) => Promise<void>;
  updateProfile: (data: CustomerProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};
const Context = createContext<CustomerAuth | null>(null);
const demo = import.meta.env.VITE_DEMO_MODE === "true";

async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/account/${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    }),
    payload = (await response
      .json()
      .catch(() => ({ error: "Service temporarily unavailable." }))) as T & {
      error?: string;
    };
  if (!response.ok)
    throw new Error(payload.error || "Service temporarily unavailable.");
  return payload;
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (demo) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const result = await accountRequest<{ user: CustomerUser | null }>(
        "session",
      );
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const signIn = useCallback(async (email: string, password: string) => {
    if (demo)
      throw new Error("Customer accounts are unavailable in demo mode.");
    const result = await accountRequest<{ user: CustomerUser }>("login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
  }, []);
  const register = useCallback(async (data: Registration) => {
    if (demo)
      throw new Error("Customer accounts are unavailable in demo mode.");
    const result = await accountRequest<{ user: CustomerUser }>("register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setUser(result.user);
  }, []);
  const updateProfile = useCallback(async (data: CustomerProfileUpdate) => {
    if (demo)
      throw new Error("Customer accounts are unavailable in demo mode.");
    const result = await accountRequest<{ user: CustomerUser }>("profile", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setUser(result.user);
  }, []);
  const signOut = useCallback(async () => {
    if (demo) {
      setUser(null);
      return;
    }
    await accountRequest<{ ok: boolean }>("logout", { method: "POST" });
    setUser(null);
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      register,
      updateProfile,
      signOut,
      refresh,
    }),
    [user, loading, signIn, register, updateProfile, signOut, refresh],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCustomerAuth() {
  const value = useContext(Context);
  if (!value)
    throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return value;
}
