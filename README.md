# ClassLedger

A single-school report-card application: separate teacher uploads → validated marks → missing-mark decisions → approved rankings → section PDFs and ZIP exports.

Start with [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for verified results and remaining limitations. The workspace starts empty — no fictional students are preloaded.

## Deploy to Vercel

1. Create a hosted PostgreSQL database (Vercel Postgres, Neon or any PostgreSQL 16+ URL) and copy its connection string.
2. Import this repository into Vercel. The project root is this folder (`ClassLedger`); `vercel.json` sets the install and build commands.
3. Add environment variables under **Project → Settings → Environment Variables**:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `SCHOOL_NAME` | Default school name before first-run setup (optional) |
| `REDIS_URL` | Only for a separate Redis-backed report worker (optional) |

4. Deploy. The build runs the SQL migrations and then `next build` with the PostgreSQL adapter.

On first visit the app shows a one-time **Set up your school** screen where you create the administrator username and password — no seeding step is required. Files and report PDFs are stored in PostgreSQL, so no extra storage service is needed, and Redis is optional (without it, report batches render on demand).

## Run locally

Prerequisites: Node.js 22.13+, pnpm 11.25 and a PostgreSQL 16+ database (`DATABASE_URL`).

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
npm run db:migrate
npm run dev:postgres
```

Open http://localhost:3000 and complete the one-time school setup screen. `npm run db:seed` is optional; it configures a school without the setup screen using `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Accounts

- **Administrator** — the username and password you create on the setup screen. Described as `admin` in the deployment steps above.
- **Teachers** — one account per subject is created automatically when the school is set up:

| Subject | Username | Initial password |
|---|---|---|
| Mathematics | `math` | `math-ClassLedger-2026` |
| English | `english` | `english-ClassLedger-2026` |
| Science | `science` | `science-ClassLedger-2026` |

Sign in through the matching section of the login screen: administrators use **Administrator**, teachers use **Teacher**. Change any password or add more staff (for example a registrar or a second approver) under **People & roles**.

Self-approval is enabled by default so a single administrator can run the whole cycle; turn it off under **School settings** to require a separate approver.

## Workflow

1. As a teacher, open Teaching assignments. Download the roster template or use a matching XLSX in `sample-data/`. Upload, map columns, validate and commit.
2. As administrator, inspect Missing marks. Record authorized numeric decisions and justifications for absent or reported students.
3. Calculate grade sections. Approve each section, or approve the whole grade together for grade-wide ranks.
4. In Template studio, use the built-in sample or upload a one-page PDF, map print fields, preview and approve a version.
5. Generate report cards: the ZIP contains a print-ready PDF per section, optional individual PDFs and a manifest. Open each section PDF to print it from the browser.
6. A teacher correction after approval requires a reason and admin commitment. Recalculate and approve a new revision; prior approved results and PDFs remain unchanged.

## Build and verify

```bash
npm run typecheck
npm test
npm run build:postgres
npm run start:postgres
```

Tests apply the real SQL migrations in the PostgreSQL engine via PGlite. They do not verify a deployed Vercel environment. Browser E2E specs are provided for a fresh disposable development seed. Start the web app, set `E2E_PASSWORD` and `E2E_ADMIN_USERNAME` to the credentials you created, then run:

```bash
pnpm exec playwright install chromium
npm run test:e2e
```

Never run the mutation tests against real student records.

## Architecture

The application uses Next.js, strict TypeScript, PostgreSQL parameterized transactions, bcrypt username/password sessions and PDF report rendering. File uploads and generated PDFs are stored in a PostgreSQL `object_blob` table, so the app runs on stateless hosts such as Vercel. `prisma/schema.prisma` documents the relational models; SQL migrations add partial indexes and locking triggers. Runtime queries use the pg driver rather than Prisma Client.

`npm run dev:postgres`, `npm run build:postgres` and `npm run start:postgres` select the PostgreSQL adapter through `scripts/classledger/next.mjs`. Redis and a background worker are optional; without `REDIS_URL` the web app renders report batches on demand.

## Documentation

- [Architecture](docs/architecture.md) · [ER diagram](docs/er-diagram.md)
- [API](docs/api.md) · [Academic rules](docs/academic-rules.md)
- [Template mapping](docs/template-mapping.md) · [UI system](docs/ui-system.md)
- [Security, backups and operations](docs/security-and-operations.md)
- [Original requirements](docs/product-requirements.md) · [Verification status](IMPLEMENTATION_STATUS.md)
