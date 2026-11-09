# API contracts

Base `/api`; JSON errors `{error,message}`. Requests use an HttpOnly session cookie issued by the administrator or teacher sign-in portal. File endpoints check authorization. Write requests reject foreign Origin headers.

| Routes | Purpose and permissions |
|---|---|
| GET health, GET bootstrap | Database readiness; school/current actor/sign-in capability |
| POST auth/login, auth/logout | Username/password sign-in (administrator or teacher portal), logout and session revocation |
| POST setup | One-time school configuration: creates the first administrator account |
| GET lookups, overview?term | Academic metadata; staff-only counts and completeness |
| GET/POST students, PATCH students/:id | Staff roster; admin/registrar edits require reason. List parameters: term, section, q, page (25 rows) |
| POST roster-import, roster-import/:id/commit | Admin/registrar: multipart file, section, year; validate then atomically commit new students |
| GET/POST assignments, GET assignments/:id/template | Assigned teacher/staff listing; admin/registrar create; authorized XLSX template |
| POST imports/inspect, imports/stage | Admin/assigned teacher: multipart file, assignment, mapping JSON, correction reason |
| GET imports, imports/:id, imports/:id/errors | Authorized history, validation preview and CSV errors |
| POST imports/:id/commit | Atomic commit; post-approval correction requires admin |
| GET exceptions, exceptions/:id | Staff register/detail; filters term, section, status, reason, q |
| POST exceptions/:id | action, justification, revision, value for RESOLVE; numeric decisions restricted to admin/approver |
| GET results/readiness, results, results/:id | Staff completeness, result history/details |
| POST results/calculate | Admin/registrar: term, section |
| POST results/:id/approve, results/approve-grade | APPROVER; single run or complete runIds array |
| GET/POST templates, GET templates/:id | Staff viewing; admin/registrar upload a one-page PDF and name it |
| PUT templates/:id/fields | fields, page_width, page_height; approved edits create new draft |
| POST templates/:id/approve | Geometry validation and version approval |
| GET templates/:id/preview, templates/:id/background | Authorized PDF preview or original background |
| GET/POST report-batches, GET report-batches/:id | Staff; creation takes runIds, templateId, individuals, sort (rank/id/name) |
| POST report-batches/:id/process, /cancel | Resume/retry or cancel QUEUED/FAILED jobs |
| GET report-batches/:id/download, /manifest, /file?file=ID | Authenticated ZIP, manifest or section PDF |
| GET/PUT settings | Admin: school name, address, timezone, selfApproval, gradeRankRequired |
| POST setup-items | Admin/registrar: kind, label and related IDs; year/term/grade/section/subject/offering |
| GET/POST users, PATCH users/:id | Admin: name, username, roles, active, optional password |
| GET audit?q&page | Staff; 50 append-only events per page |

Main error codes: AUTH_REQUIRED, FORBIDDEN, NOT_ASSIGNED, NOT_FOUND, CONFLICT, INVALID_BATCH, INVALID_SCORE, STALE_SUBMISSION, INCOMPLETE_SCOPE, SEPARATE_APPROVER, STALE_RESULT_RUN, GRADE_INCOMPLETE, NOT_APPROVED, TEMPLATE_MAPPING_INCOMPLETE, PDF_TEXT_OVERFLOW, RATE_LIMIT.

Lists are bounded: students 25/page; audit 50/page; submissions 200 latest; exceptions 500; batches 100. Cursor pagination for the latter lists is not implemented. Input schemas live alongside handlers in lib/server/api.ts; pure calculations and geometry validations are reusable modules.
