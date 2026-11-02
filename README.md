# PIJITPHET Stock

Car stock and claims application: Vercel Node.js API and Neon PostgreSQL.

## Local development

Use Node.js 24. Run `npm ci`, copy `.env.example` to `.env.local`, and set DATABASE_URL, APP_PIN, SESSION_SECRET and ROLE_PASSWORD_KEY. The last two values must each contain at least 32 characters. Keep existing keys when using an existing database.

Run `npm run db:setup` once for a new database, then `npm run dev`.
The current Neon database already contains the imported 300 vehicles; deployment does not import data again.

## Vercel deployment from GitHub

Import divoctako/Stock-Car into Vercel (or connect it under the existing project's Settings > Git).

- Root Directory: repository root (`./`)
- Framework: Other
- Install Command: npm ci
- Build Command: npm run build
- Output Directory: public
- Node.js: 24.x
- Production Branch: main

Set DATABASE_URL, APP_PIN, SESSION_SECRET and ROLE_PASSWORD_KEY in Vercel Production environment variables, then deploy. Changes pushed to main trigger production deployments. Use a separate Neon database/branch for Preview environments.

Do not commit .env.local, database backups, Excel inventory or demo-data. Keep the Neon connection URL and encryption keys in environment variables.

## Inventory import

The local scripts/import-stock-demo.py reads the original BYD workbook into demo-data/byd-stock-import.json. Then run `node --env-file-if-exists=.env.local scripts/import-byd.mjs` locally to import missing VINs. Existing VINs are skipped. Source workbook and generated inventory are intentionally excluded from GitHub.
