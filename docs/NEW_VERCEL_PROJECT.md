# Fresh Vercel project preparation

Use a fresh Vercel project for the Neon-based ZEVENRA deployment. Keep the current production project untouched until the new preview has passed all checks.

## Build settings

- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 20 or newer

## Environment variables

Configure these in the new Vercel project:

- `DATABASE_URL` — pooled Neon connection used by runtime functions
- `DATABASE_URL_UNPOOLED` — direct Neon connection for administration only
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`
- `CUSTOMER_SESSION_SECRET`
- `ALLOWED_ORIGIN`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `VITE_API_BASE=/api`
- `VITE_DEMO_MODE=false`

## Release order

1. Rotate any credentials that have previously been exposed.
2. Create the fresh Vercel project from the repository.
3. Add the environment variables above.
4. Deploy a preview from `dev-rebuild`.
5. Test storefront, admin, delivery saving, checkout, customer accounts, pre-orders, protected receipt access, and order updates.
6. Run the database verifier against Neon.
7. Only after preview approval, merge the release branch and move the production domain.
8. Retire the previous Vercel project after the new production deployment is stable.
