# ZEVENRA PostgreSQL database

Neon PostgreSQL is the only runtime database for ZEVENRA. Browser code never receives a database connection string; all reads and writes go through the Vercel API.

## Commands

```bash
node --env-file=.env.local scripts/db-migrate.mjs
node --env-file=.env.local scripts/db-verify.mjs
```

- `db-migrate.mjs` applies unapplied SQL files from `database/migrations` in filename order.
- `db-verify.mjs` checks required tables, migration records, invalid totals, negative stock, and orphan relationships without changing data.

Migration and verification prefer `DATABASE_URL_UNPOOLED` and fall back to `DATABASE_URL`. Runtime functions use `DATABASE_URL`.

Do not commit database dumps, connection strings, or `.env.local`.
