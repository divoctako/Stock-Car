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

## Excel exports from Neon

The relational tables are the source of truth: `cars` (one vehicle per row), `claims` (one claim per row, nullable car_id for other claims), `app_options`, `role_credentials`, `request_receipts`, `audit_log`, `login_attempts`, `app_meta`, and `app_values`. Money is numeric, dates are DATE, and identifiers are text to retain leading zeros. `app_values` stores scalar settings and import provenance as separate path/type/value rows, including empty arrays/objects; it contains no JSON column.

Run `npm run db:export-views` to install live reporting views, or run `sql/export-views.sql` in Neon's SQL Editor.

In Neon's SQL Editor run one of these queries and download the results as XLSX:

```sql
SELECT * FROM public.export_cars ORDER BY "รหัสรถ";
SELECT * FROM public.export_claims ORDER BY "รหัสรถ", "รหัสเคลม";
SELECT * FROM public.export_audit ORDER BY "เวลาไทย";
```

Run each query separately for a separate export. The views use Thai column headers, numeric amounts and date columns, and exclude authentication records. Cars and claims use separate views so cars with multiple claims do not duplicate vehicle prices in Excel totals.

## Migration from app_document

Deploy this version first: it supports the old storage until the atomic migration commits. Confirm the production deployment has succeeded before running `npm run db:migrate:check` and then `npm run db:migrate`. The check performs the entire migration and rolls back; apply verifies every document field, replaces export views, and drops app_document in one transaction. Any failure rolls back the migration. Do not deploy the old app after cutover. No original JSON snapshot is retained by the application.

SQL writes and app writes share a revision lock to prevent stale app snapshots from overwriting direct edits. SQL edits generate audit rows attributed to the database user. Changes to claims reset inspection. Deleting a car deletes its claims and associated provenance; audit history remains. Use DELETE, not TRUNCATE. Edit `app_options.value` to rename a choice and cascade the label to vehicles/claims. In the app, replacing a removed choice at the same position with unchanged list length is treated as a rename; reordering existing choices preserves their labels. Removing a choice preserves historical text values.

## Inventory import workflow

Admin and Stock can manage custom vehicle statuses under Settings. Available and Reserved remain fixed codes with editable labels; Delivered, Transferred and FloorPlan remain workflow states. Custom statuses are counted as active stock, appear in stock filters and can be imported from CSV by code or display label (blank defaults to Available). Removing an option preserves historical vehicle values; same-position renames propagate to vehicles and Floor Plan status. Existing databases must run `npm run db:stock-statuses` before deploying support for custom statuses; new databases receive the constraints through `db:setup`.

The local scripts/import-stock-demo.py reads the original BYD workbook into demo-data/byd-stock-import.json. Then run `node --env-file-if-exists=.env.local scripts/import-byd.mjs` locally to import missing VINs. Existing VINs are skipped. Source workbook and generated inventory are intentionally excluded from GitHub.
