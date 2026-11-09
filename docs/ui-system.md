# UI system

Inter typography, ink #142A3B, navy #17344A, teal #0D8B87, pale canvas and white cards. Desktop navigation becomes a mobile toggle; large tables scroll horizontally. Numeric cells use tabular figures. Standard dialogs manage focus, forms have labels, feedback uses alerts/status, and reduced-motion preferences are respected. Canvas accessibility still needs a full audit.

Routes: /login, /dashboard, /students, /subjects, /assignments, /upload, /submissions, /exceptions, /results, /templates, /report-cards, /settings, /users, /audit.

Shared components in components/ui.tsx provide headers, panels, badges, notices, loading/empty states, buttons, labeled fields, modals, searches and localized dates. All academic state comes from the server; browser storage retains only the term-selection preference.

The four-step upload wizard is choose file, map columns, review validation, submit. Final results use explicit approval; report generation shows student counts. Unsaved template edits prompt before discard.
