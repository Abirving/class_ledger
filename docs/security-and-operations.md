# Security and operations

SYSTEM_ADMIN manages school/accounts and corrections. REGISTRAR manages roster, setup, triage and result preparation. TEACHER is restricted server-side to assigned term/section/subject. APPROVER reviews/locks results and can record authorized numeric exception decisions. Deactivation is checked on every request; account edits revoke local sessions.

Passwords use bcrypt cost 12. Random session tokens are hashed at rest and expire after eight hours. Cookies are HttpOnly, SameSite=Strict and Secure over HTTPS. Staff sign in with a username and password through either the administrator or the teacher portal; the chosen portal must match the account's role or the request is rejected. There is no external identity provider and no automatic membership grant.

There is no production demo bypass. Seed credentials come from operator environment variables. Login and authenticated writes have rate limits. Uploads are limited to 5 MB, 5,000 rows, 30 columns, one worksheet or one table and bounded archive expansion. Import uploads accept only Excel (.xlsx) and Word (.docx) tables; report-card backgrounds accept only one-page PDFs. Formulas are rejected. Exports neutralize CSV formula prefixes while preserving the missing-score dash. Files never live under public/.

## Deployment

Run PostgreSQL 16+ on a restricted network and treat it as the single source of truth. Install from the lockfile, run npm run db:migrate, then build with npm run build:postgres. On Vercel the build command in `vercel.json` performs the migration and build automatically; set `DATABASE_URL`, `SCHOOL_NAME` and (optionally) `REDIS_URL` as environment variables. Uploaded files, template backgrounds and report PDFs are stored in the `object_blob` table so the deployment needs no separate object store and no writable local disk. Redis is optional: without `REDIS_URL` the web process renders report batches in-process via the process endpoint; with it, run the BullMQ worker (`npm run worker`) separately. Configure HTTPS at your host, enable encryption at rest and use host-appropriate credentials and monitoring.

Use /api/health and durable report status for operational checks. Worker startup and periodic recovery scan queued/running jobs. Section leases last 120 seconds; verify this against actual load. Failed batches retain errors and can be retried. ZIP creation is memory-bounded operationally to 12 sections and 500 students/section; it is not a streaming large-school export.

## Backups and restore

Back up PostgreSQL and private source/template/output files together. Stop writes/worker for a consistent filesystem snapshot or coordinate storage snapshots. Store encrypted backups outside the app host under school-approved retention.

```bash
pg_dump "$DATABASE_URL" --format=custom --file=classledger-db.backup
tar -czf classledger-files.backup.tar.gz private-storage/
```

Restore into a **new empty database and isolated file directory**, never directly over a live school before verification. Use pg_restore against the new database, restore the matching files, then verify counts, approved run IDs, PDF checksums and sample downloads. Redis queue state can be recovered from durable report_batch metadata; the database and private files remain essential.

Retention configuration/purge and restore automation are not implemented. Keep academic history and decisions until the school adopts an explicit policy. Periodically clear expired sessions and obsolete rate_limit rows through an operator maintenance task. Do not manually purge academic history.

## Password reset

An authorized operator sets ACCOUNT_EMAIL and NEW_PASSWORD (12+ characters) in their secure environment and runs npm run account:reset-password. This hashes the replacement, revokes sessions and appends an audit event. Email recovery and MFA are not included.

## Before real student records

Rehearse a fresh PostgreSQL installation; run teacher/admin E2E tests; verify role isolation, report generation, private file access, TLS and restore. Have the school confirm curriculum, exception decisions, approvers, rank policy, retention and official template. SQL migrations contain constraints that Prisma cannot express; do not run prisma db push over this database.
