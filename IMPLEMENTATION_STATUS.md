# ClassLedger implementation status

Updated 6 November 2026. Functional server application and source delivery; **not certified production-complete**. Deployment-environment verification and the precise remaining scope below are still required before live school use.

## Delivered

- React/Next.js/strict TypeScript interface; PostgreSQL schema/migrations, parameterized transactions, bcrypt sessions, RBAC; separate D1/R2 hosted adapter.
- Academic setup, student roster/import/edit, subject offerings, teacher assignments, real dashboard counts.
- Four-step XLSX/DOCX imports, canonical Student-ID matching, validation errors, omissions/missing/zero distinctions, atomic commits, source history and corrections.
- Missing-mark register with exact student/subject/teacher/source, absence and allegation reasons, review/correction requests, authorized numeric decisions and append-only timeline.
- Decimal weighted averages, two-decimal HALF_UP ranking key, competition ranks, section/grade completeness, separate approver, immutable snapshots and stale-input guards.
- PDF template upload, points-based draggable/resizable fields, keyboard movement, undo/redo, styles/overflow, draft/version approval and PDF preview.
- Durable batch metadata, PostgreSQL BullMQ worker implementation, resumable hosted jobs, separate section/individual PDFs, manifest/ZIP and private downloads.
- Vercel deployment configuration, env example, migrations, username-based seed/reset tools, fixtures, tests, operational and API documentation.

## Verification

The previous verified checkpoint passed **47 domain/integration tests** using the PostgreSQL engine through PGlite with actual migrations. It passed TypeScript, Prisma schema validation and native/hosted builds. Two local D1 migrations ran successfully. Acceptance output had exactly **20 Grade 8A pages, 30 Grade 8B pages and 50 individual PDFs**. PDF extraction verified Ethiopic and long names; those pages were visually checked without clipping.

This recovered source is being reverified before final delivery; final check results are appended below. E2E specs are supplied, but authenticated browser execution, a networked PostgreSQL instance, an actual Vercel deployment, queue recovery under real infrastructure, load testing and backup restore are **not verified** in the authoring environment.

## Remaining scope

1. Existing academic setup/offerings/assignments have create/view workflows, without general edit/archive/reassignment UI. Changing existing weights/maxima or teacher assignments requires a reviewed correction workflow or migration.
2. Numeric exception resolutions are supported; per-student exemptions and non-numeric withheld/exempt outcomes are not. Final reports block incomplete scores.
3. Logos/signatures can be baked into the uploaded background. Dynamic image fields, letter-grade thresholds and configurable signature workflow are absent.
4. No DOCX converter, multi-page student template or arbitrary HTML template authoring. Subject rows are fixed 28 pt; geometry and actual text overflow block invalid output.
5. ZIP finalization is in memory with 12-section/500-student limits. Streaming large-school exports and production load/lease testing remain.
6. Hosted D1/R2 jobs may need an authenticated resume visit after background budgets expire; PostgreSQL edition has the dedicated Redis worker.
7. Student/audit pages paginate. Submissions/exceptions/report history are bounded latest lists. Full column sorting, roster export/import-history UI, bulk activation and teacher notifications remain absent.
8. No automatic retention purge, S3/MinIO adapter, email recovery, MFA, external monitoring or automated restore. Operator procedures are documented.
9. Staff sign in with a username and password on the portal matching their role; there is no external identity provider or hosting-membership step.
10. Responsive UI and focus handling are implemented; a full accessibility audit, particularly the canvas mapper, remains.
11. The school's official report-card background and final academic policies were not supplied. A working sample is included.

## Operator acceptance

Follow README in a disposable environment: provision PostgreSQL, migrate, complete the first-run school setup, run the web app, run tests/E2E and export both sections. Rehearse restore and map the official template before real data. Preserve immutable snapshots and revision guards when extending the app.

## Final source checks — 6 November 2026

Freshly rerun: 47/47 tests passed, TypeScript passed, Prisma schema valid, and native Next.js production build passed. PDF page counts and Ethiopic/long-name extraction passed again. See docs/verification.json. Authenticated browser E2E against a networked PostgreSQL instance and an actual Vercel deployment remain unverified.
