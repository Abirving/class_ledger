# ASTRA 6 | MASTER BUILD DIRECTIVE
## School Report Card Automation Platform
**Version:** 1.0 | **Scope:** Single-school production MVP | **Output:** Fully functioning full-stack web application
**Core promise:** Separate teacher uploads -> accurate consolidated marks -> visible missing-mark exceptions -> approved rankings -> student-specific report cards exported by grade and section.

> THIS IS AN IMPLEMENTATION DIRECTIVE, NOT AN IDEA GENERATION REQUEST. Build the actual application, database, authentication, APIs, background jobs, polished user interface, tests, documentation and deployment configuration. Do not stop at a UI mockup, static landing page, pseudocode or incomplete CRUD scaffolding.

## 00 | YOUR ROLE, AUTHORITY AND EXECUTION RULES

You are ASTRA 6 acting as a principal full-stack software architect, senior product designer, database engineer, security engineer, QA lead and delivery engineer. Build a modern, professional, secure, reliable, intuitive school administration web application called **ClassLedger** (working product name; make school branding configurable). Optimize for nontechnical school administrators and teachers who need to complete academic work quickly and confidently.

**The authoritative product scope is THIS prompt.** The implementation is for ONE school for version 1. No certificates, no parent portal, no attendance module, no tuition, no AI-driven grading, no multi-school subscription system. Do not silently replace the requested report-card workflow with a certificate workflow. If the attached Version 2 technical blueprint is available, use it for supplementary ER diagrams and visual ideas, but where it conflicts with this master build directive, this directive controls.

**Execution contract**
- First inspect the repository, runtime, installed dependencies and available tools. Do not assume files, services, credentials or deployment tools exist.
- If starting from an empty repository, create the application from scratch. If a project exists, preserve functional code, identify gaps and enhance it safely.
- Implement real end-to-end functionality with persisted PostgreSQL data. No fake UI-only data, demo-only APIs, hardcoded admin bypasses, deceptive loading states or buttons that do nothing.
- Make sensible product decisions without repeatedly seeking permission. Only request input when an essential external dependency is truly missing (for example, the school's actual report-card template or a deployment secret). Build a working configurable sample template and mapper meanwhile.
- Execute in milestones. At each milestone, write code, run relevant checks, fix failures and give a concise progress summary. Continue to the next milestone while the environment permits.
- Record any unimplemented items precisely in `IMPLEMENTATION_STATUS.md`. Never state that the entire system is complete if integration, migrations, tests or output generation have not actually run.
- Deliver actual source files, database migrations, seed data, `.env.example`, local development instructions, automated tests and deployment guidance. Do not simply describe how someone might build it.
- Keep all logic in the server/database where appropriate. Use UTC timestamps in storage; display dates in the school-configured time zone (`Africa/Addis_Ababa` by default). Support English initially and test Ethiopic/Amharic Unicode names in report card PDFs.

## 01 | PRODUCT GOAL AND NON-NEGOTIABLE SCENARIOS

**Problem.** Subject teachers supply independent Excel/CSV mark sheets. The registrar currently merges them manually, checks which students lack scores, calculates averages and section/grade rankings, then copies information into individual report cards. Errors in IDs, missing marks and wrong rankings are unacceptable.

**Target outcome.** The school maintains a canonical student roster, sets up grades/sections/subjects and teaching assignments, accepts separate uploads from each teacher, validates by Student ID and official enrollment, consolidates each student's subject marks, exposes missing-mark exceptions to administrators, computes approved results, and exports one personalized report-card page per student—separately grouped into Grade 8A, 8B and every other section.

**Acceptance scenario A — independent uploads.** A Mathematics teacher uploads marks for Grade 8A in one student order; English and Science teachers upload their own files in different orders. Merge by Student ID, never by row number or name similarity. Section and grade values supplied in files are cross-checks against canonical enrollment, not authority to move students.

**Acceptance scenario B — missing mark and reported incident.** Grade 8A has 20 students. A teacher uploads score `-` for Student ID `1005`, name `Abel Tesfaye`, Mathematics, reason `REPORTED_MISCONDUCT`. The administrator must immediately see the ID, official full name, Grade 8, Section A, subject Mathematics, teacher, reason, source submission, open status and an action to request clarification or record an authorized decision. This is a report from the teacher, NOT a proven finding. Never convert the dash automatically to zero.

**Acceptance scenario C — absent student and omitted row.** Student `1012`, `Sara Bekele`, has `-` with reason `ABSENT`. Another student is omitted from an otherwise submitted Maths file. Both become distinct, actionable missing-mark exceptions with the correct Student ID and subject.

**Acceptance scenario D — separate output.** Grade 8A has 20 students; Grade 8B has 30. The school can generate `Grade_08/Section_A.pdf` with exactly 20 personalized report-card pages and `Grade_08/Section_B.pdf` with exactly 30, never mixed. Each page is one student's report card. ZIP export has named grade folders, section PDFs, individual PDFs when requested and a manifest with record counts.

**Acceptance scenario E — approvals and correction.** A teacher revises a score after an approved run. The approved run remains unchanged. New scores go through correction/review, create a new revision and result run, and generate explicitly versioned replacement PDFs. Earlier files remain traceable.

## 02 | TARGET USERS AND PERMISSIONS

Create four role profiles. A user may have one or more roles only if explicitly authorized; default to least privilege.

**SYSTEM_ADMIN** — school settings, year/term setup, roster management, subject definitions, teacher assignments, all imports, exception register, result run operations, template management, export, user permissions and audit. Administrative correction must require a reason.

**REGISTRAR** — roster, section setup, import oversight, exception triage, result preparation, template review and exports as delegated; may not approve their own unreviewed result without designated policy.

**TEACHER** — view only assigned grade-section-subject-term combinations; download assigned upload template; upload, validate and resubmit their own scores; see their own submission history and corrections; cannot see unrelated sections or approve rankings.

**APPROVER / PRINCIPAL** — inspect completeness and provisional results, approve/lock finalized section runs, authorize exceptions or reopen decisions under recorded policy, view finalized report cards and audit trail. The app may let the admin configure authorized approvers.

Apply permissions to route handlers, database queries and file downloads (not only hidden buttons). Use per-assignment authorization for teachers. Implement session expiry and account deactivation, prevent privilege escalation and ensure the currently selected term is part of every sensitive query.

## 03 | EXPERIENCE DESIGN: PREMIUM, MODERN, EFFORTLESS

**Visual personality:** Calm academic professionalism, premium school operations software, beautifully designed but not flashy. Think a carefully crafted modern SaaS dashboard: airy spacing, clear typography, subtle depth, trustworthy colors, polished tables, strong information hierarchy and delightful but restrained micro-interactions. This is an operations system, NOT an animated marketing website.

**Design tokens (adjust as needed while preserving this direction):**
- Primary ink `#142A3B`; deep navy `#17344A`; accent teal `#0D8B87`; accent blue `#3164C9`.
- Canvas `#F7F9FC`; surfaces `#FFFFFF`; borders `#E2E8F0`; muted text `#66788A`.
- Success `#167B67`; warning `#B7791F`; critical `#B84B4B`; accessible contrast mandatory.
- Typography: Plus Jakarta Sans or Inter for interface; locally available Ethiopic-capable fallback such as Noto Sans Ethiopic for names. Numeric score cells use tabular lining numerals.
- 8px spacing rhythm, 12-16px container radii, very subtle shadows, 44px minimum comfortable click targets where practical, accessible focus styles. Layouts adapt to mobile and tablet but desktop-first workflows may expose horizontal tables with clear mobile alternatives.

**Page shell:** permanent/collapsible left nav on wide screens; compact topbar with academic year and term switcher, signed-in identity, notification count and a clear current section/assignment context. Breadcrumbs and page-specific primary actions. A search/filter bar on data-heavy pages. Never hide critical academic status inside icon-only controls.

**Micro UX requirements:** skeleton loaders and progress indicators; empty states with next action; retryable failures; inline validation with row numbers; confirmation before destructive action; success toasts with durable state updates; clear unsaved-change warnings; consistent badges for DRAFT / VALIDATING / INCOMPLETE / READY / APPROVED / EXPORTED; keyboard-navigable forms, readable labels and tooltips.

**Dashboard experience:** a compelling but calm admin dashboard: total active students, expected teacher submissions, submitted/validated assignments, open exceptions, sections ready to approve, export jobs; subject coverage heatmap or matrix; priority action list; recent submissions; quick links to filter views. Every KPI is calculated from real database queries.

**Polish standard:** comparable in cohesion and navigation quality to a serious commercial SaaS product. Real forms, meaningful responsive states, data tables with sort/search/filter/pagination, clear stepper flows for file upload and template mapping, obvious printing actions. Keep visual ornament subordinate to clarity. Avoid generic gradients everywhere and oversized charts that obscure necessary data.

## 04 | INFORMATION ARCHITECTURE AND ROUTES

Design these functioning application areas. Route names are suggestions; use consistent naming.

`/login` — accessible secure login, school identity and password recovery/admin reset procedure.
`/dashboard` — role-specific overview and alerts.
`/school/settings` — school name, logo, time zone, academic year, terms, grades, sections and grading policies.
`/students` and `/students/import` — search/edit/activate students, roster import and validation history.
`/subjects` — grade subject offerings, max marks, active/inactive, optional weighting.
`/assignments` — teacher-to-grade/section/subject/term mapping, expected submissions.
`/teacher/assignments` — teacher's assigned classes and download template action.
`/teacher/upload/[assignmentId]` — four-step import wizard: choose file, map columns, validate preview, submit and track.
`/submissions` — administrative upload monitor, coverage status, versions and validation detail.
`/exceptions` and `/exceptions/[id]` — administrator missing-mark register and individual resolution timeline.
`/results` and `/results/[scopeId]` — consolidation, provisional calculations, rank tables, approval gate and lock/reopen workflow.
`/templates` and `/templates/[id]/edit` — upload report-card background, field overlay and live preview.
`/report-cards` and `/report-cards/batches/[id]` — grade/section selection, job progress, preview, section PDFs, ZIP download.
`/audit` — searchable administrative/academic event log.
`/users` — create/disable accounts, roles, teacher assignments.

Also implement appropriate 403/404/error states, authenticated download routes, and links from dashboard alerts directly to filtered records.

## 05 | RECOMMENDED IMPLEMENTATION STACK

Use one maintainable TypeScript architecture, choosing stable compatible versions after inspecting the environment. Avoid experimental packages for critical academic calculations.

| Area | Technology | Requirement |
|---|---|---|
| Web | Next.js App Router + React + strict TypeScript | Full stack, SSR where useful, server-side authorization |
| UI | Tailwind CSS + shadcn/ui/Radix components | Accessible design system, tables, dialogs, toasts |
| Forms | React Hook Form + Zod | Shared typed validations |
| Tables | TanStack Table | Sorting, filtering, pagination, sticky identifiers |
| Database | PostgreSQL + Prisma | Relational constraints, migrations, decimal fields |
| Auth | Auth.js or equivalent vetted session system | Passwords hashed using Argon2id/bcrypt, roles, secure cookies |
| Imports | ExcelJS for XLSX, vetted CSV parser | Streaming/size limits, staged rows, error reports |
| Jobs | BullMQ + Redis | PDF batch generation with progress/retry/idempotency |
| PDFs | Playwright (HTML/CSS layouts) + pdf-lib (PDF overlays/merging) | Accurate paper dimensions and sharp output |
| Images | Sharp | Template preview and background preparation |
| Storage | S3-compatible private bucket; local/MinIO dev option | Private templates, source spreadsheets, report files |
| Tests | Vitest + React Testing Library + Playwright E2E | Calculation, upload, RBAC and print workflows |
| Ops | Docker Compose for development, `.env.example`, health endpoints, structured logging | Reproducible local run and deployment |

Create clear module boundaries: `auth`, `school-setup`, `students`, `assignments`, `imports`, `exceptions`, `grading`, `results`, `templates`, `exports`, `audit`, `jobs`. Keep pure domain logic independent of UI/ORM so it is unit-testable. Use pagination and transactions; never download entire sensitive rosters into browser state unnecessarily.

## 06 | RELATIONAL DATA MODEL & INVARIANTS

Create Prisma schema and PostgreSQL migrations for these entities; adapt naming consistently. Include timestamps, actor IDs and soft-delete/archive where appropriate.

**school** (`id`, `name`, `logoKey`, `timeZone`, `address`, `settingsJson`) — single record initially.
**user** (`id`, `name`, `emailOrUsername`, `passwordHash`, `active`, timestamps); **user_role** (`userId`, `role`).
**academic_year** (`id`, `label`, `startsAt`, `endsAt`, `isActive`) and **term** (`id`, `academicYearId`, `label`, `sortOrder`, `start`, `end`, `status`).
**grade** (`id`, `label`, `sortOrder`) and **section** (`id`, `gradeId`, `label`, `active`).
**student** (`id`, `studentCode` STRING unique, `fullName`, optional demographic fields only if truly needed, `active`). Preserve leading zeroes in student codes.
**enrollment** (`id`, `studentId`, `academicYearId`, `gradeId`, `sectionId`, `status`, `admissionDate`). Unique one active enrollment per student per academic year; section must belong to its grade.
**subject** (`id`, `name`, `code`, `active`) and **grade_subject** (`id`, `gradeId`, `subjectId`, `maxScore DECIMAL`, `weight DECIMAL`, `required`, `displayOrder`, `effectiveYearId` if needed). Guard incompatible grade-level curricula.
**teaching_assignment** (`id`, `teacherId`, `academicYearId`, `termId`, `gradeId`, `sectionId`, `gradeSubjectId`, `status`). Unique effective assignment policy and audit changes; assignment points to subject offering belonging to same grade.
**import_batch** (`id`, `assignmentId`, `uploadedBy`, `fileKey`, `fileHash`, `version`, `status`, `createdAt`, `submittedAt`, `rowCounts`, `errorCounts`).
**import_row** (`id`, `importBatchId`, `lineNumber`, `rawStudentCode`, `rawGrade`, `rawSection`, `rawScore`, `reasonCode`, `remark`, `matchedEnrollmentId`, `validationStatus`, `errorCodesJson`). Preserve raw cells for audit and debugging.
**score** (`id`, `enrollmentId`, `termId`, `gradeSubjectId`, `value DECIMAL nullable only while staging if needed`, `sourceRowId`, `revision`, `effective`, `enteredBy`, `approvedBy`, timestamps). Enforce one effective score per student/term/subject through indexes or transactional constraints; never treat null as numeric 0.
**score_exception** (`id`, `enrollmentId`, `termId`, `gradeSubjectId`, `assignmentId nullable`, `sourceImportRowId nullable`, `kind`, `teacherReasonCode`, `teacherRemark`, `status`, `assignedTo`, `openedAt`, `resolvedAt`). Unique active exception per enrollment/term/required subject or deterministic upsert for the same gap.
**exception_resolution** (`id`, `exceptionId`, `action`, `decision`, `effectiveScore nullable`, `justification`, `actorId`, `decidedAt`). Append-only, do not overwrite allegation history.
**result_run** (`id`, `yearId`, `termId`, `gradeId`, `sectionId nullable`, `scope`, `revision`, `status`, `policySnapshotJson`, `inputFingerprint`, `createdBy`, `approvedBy`, `approvedAt`, `supersedesId`).
**student_result** (`id`, `resultRunId`, `enrollmentId`, `earnedTotal`, `maxTotal`, `averagePercent`, `rankKey`, `sectionRank`, `gradeRank nullable`, `status`) and **result_subject_mark** (`studentResultId`, `gradeSubjectId`, `score`, `maximum`, `weight`, `percentage`, `sourceScoreId`). These are immutable approved snapshots.
**report_template** (`id`, `name`, `version`, `fileType`, `fileKey`, `pageWidth`, `pageHeight`, `coordinateMode`, `status`, `createdBy`, timestamps) and **template_field** (`id`, `templateId`, `fieldKey`, `x`, `y`, `width`, `height`, `fontFamily`, `fontSize`, `align`, `color`, `overflowPolicy`, `formatJson`).
**report_batch** (`id`, `resultRunIdsJson OR normalized join table`, `templateId`, `yearId`, `termId`, `scopeJson`, `status`, `jobId`, `createdBy`, `createdAt`, `completedAt`, `errorMessage`, `manifestKey`) and **report_file** (`id`, `reportBatchId`, `enrollmentId nullable`, `gradeId`, `sectionId`, `storageKey`, `pageCount`, `checksum`, `resultRunId`).
**audit_event** (`id`, `actorId`, `action`, `entityType`, `entityId`, `timestamp`, `beforeJson`, `afterJson`, `reason`, `requestId`, `ipMetadata`). Protect sensitive fields in logs.

**Required database constraints:** unique studentCode; foreign keys; term belongs to academicYear; enrollment grade and section consistency; teacher assignment scope; valid DECIMAL range `0 <= score <= maxScore`; duplicate import protection; unique/effective revision semantics; deleted users cannot approve; published PDFs tied to approved result snapshots and exact template version. Implement indexes on (year,term,grade,section), studentCode, assignment/status, exception status and result run status.

**Deliver an actual ER diagram** as Mermaid source in `docs/er-diagram.md` and make it consistent with the Prisma schema. Keep a migration and seed command that can run from a clean database.

## 07 | SCHOOL SETUP AND MASTER STUDENT ROSTER

Implement school logo, name, academic year/term selector, grade/section creation, active subject offerings and weight/max settings. Start with one school without multi-tenancy overhead; retain school ID only where it simplifies future growth.

Student import accepts XLSX/CSV with `Student ID`, `Full Name`, `Grade`, `Section`, optional `Enrollment Status`. Normalize whitespace without altering meaningful IDs; preserve leading zeroes and Ethiopic names. Create preview and downloadable validation errors for duplicates, invalid section, unknown grade, conflicting enrollment, reused ID and missing required columns. Require explicit confirmation before commit. Support manual edits and CSV/XLSX export for authorized users.

For each term, teacher assignment records define expected uploads and per-student subject coverage. Do not infer expected subjects from which spreadsheets happen to be present. Provide a downloadable, assignment-specific teacher upload template populated with authorized Student IDs and names to reduce errors.

## 08 | INDEPENDENT TEACHER IMPORT PIPELINE

A teacher must choose a permitted assignment: academic year -> term -> grade -> section -> subject. Upload one XLSX/CSV per assignment; alternatively support validated bulk sheets that are explicitly segmented by assignment. Never accept arbitrary subject choices from a teacher.

**Canonical columns:** `Student ID` (required), `Score` (numeric or `-`/blank), optional `Full Name`, `Grade`, `Section`, `Reason Code`, `Remark`. Save source file privately and a row-by-row staged representation. Accept column synonyms via mapping UI but show final mapping before submission.

**Four-step UX:** (1) Select assignment/download sample; (2) Upload and map; (3) Preview accepted rows, warnings, errors and exceptions; (4) Confirm, persist and view receipt. Provide file constraints, upload progress, row number errors and correction/resubmission guidance.

**Validation:** reject unknown IDs, mismatched enrollment, duplicates in file, unauthorized assignment, out-of-range scores, invalid decimal, invalid term, conflicting effective revisions and unsupported formats; flag spelling mismatches as warnings rather than silently updating master names. `-`, empty, `N/A` or absent row must remain missing until explicitly resolved. `0` is a real score, not missing.

**Submission completeness:** distinguish (1) teacher never submitted the assignment, (2) teacher submitted but omitted an enrolled student, (3) teacher included the student with missing score and reason, (4) teacher supplied valid numeric 0, and (5) row failed validation. These must appear as separate states with actionable explanations.

**Atomicity and idempotence:** stage first, do not partially commit invalid batches without a clear explicit policy, hash files to detect accidental duplicate uploads, use database transactions to commit valid complete submissions, and maintain version history on resubmissions. All changes after approval require an authorized correction flow.

## 09 | MANDATORY MISSING MARKS & EXCEPTIONS CENTER

This is a FIRST-CLASS, VISIBLE, NON-OPTIONAL MVP MODULE. After every upload, and before every result finalization, compute expected coverage as enrolled active students x required grade subjects x term. Reconcile with all effective scores and teacher assignment submissions. Create/update missing-mark exceptions for gaps even if the teacher never typed a dash or omitted an entire file.

**Admin missing-mark table MUST show:** Student ID, official full name, academic year, term, grade, section, subject, assigned teacher, uploaded raw value, reason code, teacher remark, exception type, source batch or “not submitted”, opened date, current status, assigned reviewer, and action. Provide global search, filters by grade/section/subject/teacher/status/kind, sortable columns, detail drawer, counts and export to CSV. Dashboard KPI directly opens this filtered view.

**Reason codes:** `NOT_ENTERED`, `ABSENT`, `REPORTED_MISCONDUCT`, `OTHER`, `UNKNOWN` (unexplained). Do not turn a teacher-reported cheating allegation into an established fact or penalize automatically. Store the exact original teacher text separately from the administrator's determination.

**Exception workflow:** `OPEN -> NEEDS_TEACHER` for unexplained -> `UNDER_REVIEW` for decision -> `RESOLVED` by an authorized score or policy-defined exclusion -> `REOPENED` on a later correction if necessary. Every transition records actor, time, reason and linked source. Admin may request correction, request clarification, enter approved numeric score, or apply an explicitly configured nonnumeric academic outcome; no silent zero substitution. Approval controls require appropriate authorization.

**Blocking:** an unresolved required mark prevents finalization of the affected SECTION's ranking and report-card batch. Other complete sections may proceed independently. A GRADE-WIDE rank is not finalized until all eligible sections in that grade are complete and comparable. If a template includes grade rank, require the school to configure whether it is mandatory for printing; if mandatory, printing waits for grade-wide approval. If optional, show a clearly approved blank/“Pending” representation—never invent a rank.

**Admin example:** In Grade 8A, Maths has 20 expected, 18 numeric marks, 2 missing. Exception table: `1005 | Abel Tesfaye | 8A | Mathematics | Reported misconduct | Under review`, `1012 | Sara Bekele | 8A | Mathematics | Absent | Needs decision`. Grade 8A final approval disabled until resolved. Grade 8B's own complete section result may be approved and printed separately.

## 10 | SCORE CONSOLIDATION, AVERAGES AND RANKS

**Authoritative join:** `student.studentCode -> enrollment for selected year -> active grade/section -> required grade subjects -> effective validated score for selected term`. Never join by names or row order. Make mismatch/duplicate conditions visible rather than guessing.

Use fixed-precision decimal arithmetic end to end. For each subject `subjectPercentage = 100 * score / maxScore`. Overall `weightedAveragePercent = SUM(subjectPercentage * weight) / SUM(weight)` for configured included subjects. For equal-max, equal-weight subjects this equals the ordinary mean. Also store `earnedTotal = SUM(score)` and `maxTotal = SUM(maxScore)`; display both clearly. Do NOT use earnedTotal / maxTotal as the weighted average when subject maxima and weights are unequal unless policy explicitly specifies that metric.

**Ranking policy:** section rank groups by year+term+grade+section; grade rank groups by year+term+grade across eligible comparable sections. Default competition rank with ties (`1,1,3`). Rank key defaults to average percentage rounded to TWO decimals using a documented deterministic decimal policy; all calculations, persisted snapshots and previews must use the SAME rank key. Student ID provides deterministic display order within ties, not an artificial tie-break to alter ranks.

**Readiness:** missing scores, invalid rows, unauthorized overrides, incompatible curricula or unreviewed exceptions block the affected final scope. Never create final ranks from partial submissions. Preview may display provisional metrics prominently labeled `UNOFFICIAL - NOT FOR PRINT`. Administrators can see per-section readiness and why an action is blocked.

**Snapshots & approval:** create immutable result runs with input hash and rules snapshot, store per-subject score sources, section ranks and optional grade rank. Authorized approver sees changes, completes review, approves/locks, and only then enables final PDF jobs. Reopen/supersede rather than mutate approved snapshots. Historical term reports remain reproducible.

## 11 | UPLOADABLE REPORT-CARD TEMPLATE STUDIO

This application produces **ACADEMIC REPORT CARDS**, not achievement certificates. The school WILL supply its exact official report card later. The app must work immediately with a clearly marked sample template but allow the school to upload, map, version, preview, approve and replace its real template WITHOUT changing academic data or backend code.

**MVP accepted template inputs:** PDF (first-class original-quality overlay) and JPG/PNG (background image with vector text overlay). If DOCX support is implemented, use an explicit server-side conversion service with clear fidelity/QA checks; do not misleadingly claim perfect Word layout support when no converter is present.

**Designer interaction:** upload file; detect/display page size and orientation; choose page/print dimensions; show accurate zoomable page preview and rulers; drag, resize and snap named dynamic fields; choose font, color, alignment, font size, line wrap and overflow rule; configure fixed anchor for subject table rows; save as DRAFT; preview with multiple representative students; publish an APPROVED template version. Support undo/redo and keyboard controls where feasible. Coordinate system must be documented, stable across zoom and export, and use print-space measurements rather than raw screenshot pixels.

**Dynamic fields:** school name/logo, academic year, term, Student ID, full name, grade, section, individual subject name, obtained score, maximum score, optional subject grade, earned total, max total, average %, section rank, grade rank if available, issue date, approver name, template revision, report reference. Never print sensitive reported-misconduct allegations by default.

**Subject table:** allow repeatable dynamic rows for different grade subject lists. If uploaded template has too little room, warn and block publication or support clearly configured overflow pages; do NOT truncate subject results or resize text illegibly. Provide a template field check that shows missing required mappings, overlapping fields, out-of-bounds content and long-name cases. Use embedded fonts supporting English and Ethiopic/Amharic glyphs and test PDF extraction and printing.

**Rendering paths:** for PDF backgrounds use pdf-lib overlays or equivalent vector-preserving technique; for image backgrounds place at correct physical page size and overlay vector text; for flexible HTML templates render print CSS via Playwright. Do not rasterize the entire page unless necessary. Use a fixed print pipeline with repeatable fonts and page dimensions; verify 100% output scale and one report card per student page by default.

## 12 | SEPARATE GRADE/SECTION PDF EXPORT & JOBS

**Export UX:** academic year -> term -> grade -> section(s) -> approved result run -> template version -> preview -> choose format -> generate. Allow single section, multiple sections or full-school ZIP if each selected section is approved. Show record count in confirmation. Default sort by section rank then Student ID; provide an optional student ID/alphabetical sort. This does not change ranking values.

**Outputs:** `Report_Cards_<year>_<term>.zip/Grade_08/Section_A.pdf`, `Section_B.pdf`, and so on; optionally per-student PDFs in a separate subfolder. The default section PDF contains exactly one page per eligible student, ordered as selected. Do not mix section pages or silently omit records. Include a CSV manifest with student count, section, result revision, template version, generated time and checksum/filename when feasible.

**Background job behavior:** queue, running/progress, completed, failed, cancelled. Use BullMQ/Redis, durable metadata in Postgres and private file storage. Stream/segment large outputs to avoid memory spikes. Make retries idempotent, show user-friendly error information and protect downloads with signed URLs or authenticated endpoints. Disallow final generation from unapproved or stale inputs.

**Output verification:** compare source approved student counts to generated page counts and manifest counts, ensure Student IDs are unique within each section PDF, inspect first/last and edge-case students, run automated PDF parse or page-count tests, and verify embedded Unicode fonts. Show explicit errors when validation fails instead of releasing a corrupted batch.

## 13 | API/SERVICE CONTRACTS

Expose typed secure endpoints/route handlers with Zod request validation, consistent success/errors, pagination and authorization. Example surface (adjust conventions coherently):

`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`.
`GET/POST /api/academic-years`, `GET/POST /api/terms`, `GET/POST /api/grades`, `GET/POST /api/sections`, `GET/POST /api/grade-subjects`.
`GET/POST /api/students`, `POST /api/students/import/preview`, `POST /api/students/import/commit`, `GET /api/students/export`.
`GET/POST /api/assignments`, `GET /api/assignments/mine`, `GET /api/assignments/:id/template`.
`POST /api/imports/stage`, `GET /api/imports/:id/preview`, `POST /api/imports/:id/commit`, `GET /api/imports/:id/errors`, `GET /api/imports`.
`GET /api/coverage?year=&term=&grade=&section=`, `GET /api/exceptions`, `GET /api/exceptions/:id`, `POST /api/exceptions/:id/request-correction`, `POST /api/exceptions/:id/resolve`.
`POST /api/results/calculate`, `GET /api/results/readiness`, `GET /api/results/:id`, `POST /api/results/:id/approve`, `POST /api/results/:id/reopen`.
`GET/POST /api/templates`, `PUT /api/templates/:id/fields`, `POST /api/templates/:id/preview`, `POST /api/templates/:id/approve`.
`POST /api/report-batches`, `GET /api/report-batches/:id`, `GET /api/report-batches/:id/download`, `GET /api/report-batches/:id/manifest`.
`GET /api/audit`, `GET/POST /api/users`, `PATCH /api/users/:id`.

Return precise error codes (`STUDENT_NOT_FOUND`, `ENROLLMENT_MISMATCH`, `DUPLICATE_ROW`, `INVALID_SCORE`, `MISSING_REQUIRED_MARK`, `UNRESOLVED_EXCEPTION`, `NOT_ASSIGNED`, `NOT_APPROVED`, `STALE_RESULT_RUN`, `TEMPLATE_MAPPING_INCOMPLETE`, etc.). Prevent unauthenticated direct object access and unauthorized download by guessing IDs. Provide OpenAPI or equivalent API documentation and reusable service contracts.

## 14 | SECURITY, PRIVACY, RELIABILITY

- Enforce server-side RBAC, input/schema validation, safe file parsing, rate limits on auth and upload, CSRF/session controls as applicable, secure cookies, password hash policy and secret management. No hardcoded credentials in production.
- Restrict XLSX/CSV/PDF/image file sizes, MIME/signature validation, decompression limits and malicious content exposure. Do not execute spreadsheet macros or formulas; treat them as data. Defend CSV formula injection when exporting user content.
- Private object storage with short-lived signed download links or authenticated stream; access logs for reports, encryption in transit and managed encryption at rest, least-privilege storage credentials.
- Audit changes to marks, exceptions, approvals, template versions, user roles and exports. Do not log passwords or sensitive remark bodies verbatim where unnecessary.
- Back up PostgreSQL and stored source/output artifacts with documented restore procedure. Apply retention rules configurable by school policy. Lock/supersede approved results rather than silently deleting history.
- Use structured errors and operational health checks. Keep job status accurate after restarts and on retry. Use database transactions for score commit and result approval.
- Test concurrency: two teacher uploads, duplicate submissions, two admins resolving same exception, retries of PDF job, and stale snapshot approval.
- Consider local data-protection and school policy requirements before deploying with real student records. Do not use real student personal data as public seed/test content.

## 15 | SAMPLE DATA AND FULL DEMONSTRATION

Seed a fictional single school, one academic year, Semester 1, Grade 8 Section A (20 students), Grade 8 Section B (30 students), three subjects (Mathematics, English, Science), three teacher accounts, an admin and an approver. Use clearly fictional names and IDs and consistent assignments.

Provide downloadable sample teacher XLSX files with deliberately mismatched row orders. Inject:
- Student `1005`, Abel Tesfaye, Grade 8A, Maths `-`, `REPORTED_MISCONDUCT` (teacher allegation only).
- Student `1012`, Sara Bekele, Grade 8A, Maths `-`, `ABSENT`.
- One omitted student row in a separate test upload.
- One duplicate Student ID, one unknown ID, one wrong-section ID and one score above max in separate negative test fixtures.
- One legitimate numeric zero, one long student name and one Ethiopic-script name.

**Interactive demo path:** Log in as teacher; download assignment sample; upload Maths; see valid rows + two missing marks; log in as admin; see missing-mark KPI and filter by Grade 8A; inspect student 1005's teacher reason; resolve cases with approved policy; upload other teachers; calculate result; approve; upload/map sample report template; generate `Section_A.pdf` with 20 pages. Generate Grade 8B separately with 30 pages; ZIP should contain correctly separated folders/files.

Make demo sample credentials development-only, surfaced in local README, never baked into production. Include reproducible seed/reset instructions.

## 16 | REQUIRED AUTOMATED TESTS & ACCEPTANCE GATES

Implement unit tests for identity matching, score validation, weighted average arithmetic, decimal rounding, tie ranks, missing-mark detection, readiness rules and exceptions transitions. Implement integration tests for import/transaction/duplicate behavior, permissions, result snapshot versioning and job lifecycle. Implement Playwright end-to-end paths with at least one teacher, admin and approver.

| ID | Test | Pass condition |
|---|---|---|
| AC-01 | Teacher files have different row orders | Correct scores assigned by Student ID, never row index |
| AC-02 | Valid Student ID + mismatched grade/section | Reject affected row, show canonical section |
| AC-03 | Missing teacher submission | Assignment flagged, no silent complete status |
| AC-04 | Student omitted from submitted sheet | Admin exception names student ID, full name and missing subject |
| AC-05 | Maths score `-`, with misconduct remark | Exception visible, no numeric zero, no automatic punishment |
| AC-06 | Maths score `-`, reason absent | Request teacher clarification and prevent final approval |
| AC-07 | Actual numeric zero | Persist and calculate as 0, not missing |
| AC-08 | Duplicate ID or above-max score | Explain exact error and block invalid commit |
| AC-09 | Different subject maxima and weights | Normalized weighted average is mathematically correct |
| AC-10 | Tied averages | Section/grade ranks use `1,1,3` policy consistently |
| AC-11 | Grade 8A unresolved; 8B complete | 8A section blocked; complete 8B eligible for separate approval |
| AC-12 | Grade-wide rank needs all sections | Withhold final grade rank until grade completeness/comparability |
| AC-13 | Post-approval correction | Approved snapshot unchanged; new authorized revision created |
| AC-14 | Teacher visits unrelated assignment | HTTP 403; no records disclosed |
| AC-15 | PDF for Grade 8A with 20 students | Exactly 20 personalized pages, Grade 8A only |
| AC-16 | PDF for Grade 8B with 30 students | Exactly 30 personalized pages, Grade 8B only |
| AC-17 | ZIP export for Grade 8 | Correct A/B files, counts, manifest, template revisions |
| AC-18 | Long/Ethiopic names in PDF | Glyphs readable, no clipping or lost subject rows |
| AC-19 | PDF job retry | Idempotent output, accurate status and no duplicates |
| AC-20 | Full fresh environment install | Migrate, seed, run app/worker and tests successfully |

**Definition of done:** A new developer can clone, install, configure environment, run DB/Redis and migrations, seed fiction-only data, sign in, complete the entire demo, export real readable PDFs and run automated tests. No dead links, disabled key flows, hardcoded grades or placeholder academic results. Report generator works against approved persisted database snapshots.

## 17 | DELIVERY PHASES — BUILD IN THIS ORDER

**Phase 0 - Repo audit and specification check.** Inspect environment, outline project structure, risks and any missing dependencies. Establish lint/format/test scripts and design tokens.

**Phase 1 - Foundation.** Next.js app shell, polished responsive UI, login/session, RBAC, PostgreSQL/Prisma migrations, Docker dev services, real dashboard skeleton bound to DB.

**Phase 2 - Academic setup.** Years, terms, grades, sections, subjects, grading policies, teacher assignments and student import with source validation.

**Phase 3 - Teacher upload.** Assigned submission wizard, sample XLSX download, stage/preview/validate/commit pipeline, versioned history, admin upload tracking.

**Phase 4 - Missing marks.** Expected coverage reconciliation, exception table/detail/resolution, dashboard alerts, authorization and audit.

**Phase 5 - Results.** Decimal calculation, completeness gates, section & grade rank, previews, approver workflow, immutable snapshot/revision semantics.

**Phase 6 - Template studio.** PDF/image upload, field mapping, dynamic subject rows, template versioning, multi-student preview, sample template fallback.

**Phase 7 - Printing jobs.** Worker, section exports, individual PDFs, ZIP/manifest, job progress and private downloads.

**Phase 8 - Hardening and handoff.** E2E tests, PDF QA, accessibility, backup/restore notes, operational monitoring, security checks, deployment instructions and walkthrough.

At each phase: show actual file tree changes, migrations and important source files; run tests/lint/typecheck; list verified outcomes and remaining blockers; move forward where feasible. Do not let visual finishing work block the core student/marks correctness path. Never call mock screens or demos production complete.

## 18 | REQUIRED REPOSITORY AND HANDOFF CONTENTS

Create, at minimum, the following artifacts in the repo (adjust exact paths for your chosen organization):

`README.md` - quickstart, prerequisites, test/demo accounts (development-only), architecture overview.
`IMPLEMENTATION_STATUS.md` - phase completion, verified flows, unimplemented items, known risks.
`docs/product-requirements.md` - feature and policy contract.
`docs/architecture.md` - service, worker, storage, lifecycle diagrams.
`docs/er-diagram.md` - actual Mermaid ER diagram matched to Prisma.
`docs/api.md` or `openapi.yaml` - authenticated endpoint contracts.
`docs/academic-rules.md` - formulas, rounding/ties, eligibility and missing-mark gates.
`docs/template-mapping.md` - coordinate system, field keys, print/layout rules.
`docs/security-and-operations.md` - RBAC, backup, retention, restore and deployment checklist.
`docs/ui-system.md` - design tokens, component decisions, keyboard/accessibility and route inventory.
`prisma/schema.prisma` + migrations + fiction-only seed script.
`docker-compose.yml` - local Postgres, Redis, optional MinIO.
`.env.example` - all required variables with comments; no real passwords/secrets.
`tests/` - domain unit, integration and end-to-end tests.
`sample-data/` - roster and per-subject upload fixtures, invalid-case examples.
`apps/web` or equivalent organized Next.js application and a background worker entry point.

Make deploy targets configurable; do not assume a particular cloud vendor, project access or production credentials. If production deployment is unavailable, deliver fully tested local execution and exact deployment steps rather than claiming deployment.

## 19 | COMMUNICATION FORMAT WHILE YOU IMPLEMENT

Provide concise milestone summaries following this exact template:

`PHASE: <number and name>`
`BUILT: <working modules + paths>`
`VERIFIED: <commands/test counts/results>`
`DECISIONS: <explicit assumptions>`
`BLOCKERS: <only actual limitations>`
`NEXT: <next implementation phase>`

Do not flood the user with abstract design proposals once development has started. Focus on source files, working flows and demonstrated results. If your execution window or context becomes limited, stop at a stable checkpoint, update `IMPLEMENTATION_STATUS.md`, and provide the precise next-phase continuation instructions. Never claim asynchronous work or future delivery unless a real automation is configured.

## 20 | FINAL, NON-NEGOTIABLE PRODUCT STANDARD

Build a real, elegant web application a school administrator would be confident using each term: straightforward teacher uploads, transparent validation, an unmistakable missing-marks register showing EXACTLY which student lacks WHICH subject, defensible averages and rankings, and faithful report-card printing separated by each grade and section. A modern, professional interface is mandatory; academic correctness, traceability and secure approval are even more important.

**START NOW:** inspect the repository/environment, state a compact implementation plan and begin writing the application. Do not stop after the plan. Complete as many verified implementation phases as the available execution environment supports and report completion honestly.

---

# APPENDIX A | REFERENCE UI IMAGE DIRECTION (OPTIONAL)

The companion technical blueprint contains existing proposed screen mockups for the admin dashboard, teacher import wizard, consolidation status, missing marks, ranking results, template mapper and export. Use them for visual direction, but rebuild every screen as genuine accessible components. The source images are design references only, never fake screenshots substituted for a working application.

# APPENDIX B | OPEN SCHOOL POLICY SETTINGS

Before going live with real academic data, school administrators must explicitly choose: grade/section subject offerings and exemptions; academic weighting and pass criteria; tie/rounding policy; who can decide absent or reported-misconduct cases; whether grade-wide rank is mandatory on printed report cards; signature/approval workflow; retention policy; official report-card template and whether a one-student report spans one or multiple pages. Provide sensible defaults but show each unresolved policy in a setup checklist.

# APPENDIX C | HANDOFF / CONTINUATION COMMAND

If you are asked to continue later, first read `IMPLEMENTATION_STATUS.md` and this master directive, inspect the repo and tests, and resume at the first incomplete phase. Preserve working migrations, real data constraints, result revisions and UI styling; do not scaffold a second competing app. Re-test affected flows after every change. Finish the end-to-end demonstration with the 20-student Grade 8A and 30-student Grade 8B data and the missing-mark alerts.
