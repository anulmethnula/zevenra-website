# ZEVENRA PostgreSQL database

The runtime database is Neon PostgreSQL. The Vercel API is the only application layer allowed to read `DATABASE_URL`; browser code must never receive it.

## Commands

- `npm run db:migrate` applies unapplied SQL files in `database/migrations` in filename order.
- `npm run db:verify` checks required tables, migration records, constraints, and orphan counts without changing data.
- `npm run db:import-sheets -- path/to/export.json` imports a one-time Google Sheets JSON export with upsert/duplicate protection.

Migration and verification commands prefer `DATABASE_URL_UNPOOLED`, then fall back to `DATABASE_URL`. Runtime functions use `DATABASE_URL`.

Do not commit exports, database dumps, or connection strings. See `docs/DATA_MIGRATION.md` for the expected export shape and safe migration sequence.
