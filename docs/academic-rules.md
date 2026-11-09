# Academic rules

Student ID is a string. Preserve leading zeroes; merge against canonical enrollment, never row index or name similarity. A name difference is a warning. Unknown/duplicate ID, wrong grade/section, invalid numeric value or above-maximum mark blocks the entire batch.

Numeric values permit four decimal places in the range 0–maximum inclusive. Blank, dash, NA and N/A are missing; zero remains numeric. Omitted students become explicit exceptions. No numeric score is inferred from a teacher allegation. Reason codes are ABSENT, REPORTED_MISCONDUCT, NOT_SUBMITTED and OTHER.

Exception decisions append actor, timestamp, justification and any authorized score. Registrar can request correction or review; administrators/approvers can resolve with an explicitly authorized numeric value. Non-numeric exemptions are not implemented.

## Calculation

Earned total is the sum of raw subject scores. Maximum total is the sum of maxima. Weighted average = sum((score / maximum × 100) × weight) / sum(weights). Decimal.js performs arithmetic; PostgreSQL stores NUMERIC. The rank key is rounded to two decimals using HALF_UP. Competition ranks are 1,1,3; Student ID only stabilizes display order within ties.

Missing marks, open exceptions, missing required submissions and pending latest staged/invalid uploads block final calculation. A later committed file supersedes earlier uncommitted files for readiness. Section and school revision guards prevent stale approval and stale new exports.

Snapshots retain student identifiers/names, subject names, values, maxima, weights, source-score IDs, policy, school context and fingerprint. Approved runs are locked by database triggers. Self-approval is off by default.

Grade ranks require every active section in the same grade/term and comparable curricula. Approve READY sections together. If already approved separately, calculate new revisions before grade-wide approval.

Post-approval corrections require a reason and administrator commitment. New calculation and approval are required before replacement reports. Earlier approved snapshots and exported files remain traceable and unchanged.
