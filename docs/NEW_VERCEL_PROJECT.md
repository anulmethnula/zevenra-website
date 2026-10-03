# Fresh Vercel project preparation

Create the replacement project only after a Neon branch has been migrated and fully verified. Do not reuse the old project as the migration mechanism.

Configure:

- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 20 or newer
- `DATABASE_URL` (pooled Neon connection)
- `DATABASE_URL_UNPOOLED` (migration/administration only; runtime does not read it)
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

Deploy to a preview first. Validate all functional flows and compare migrated records before assigning production domains. Keep the previous Vercel project and Sheet available for rollback/reference until the new production deployment is accepted.
