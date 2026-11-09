# Template mapping

Supported input: one page PDF only, uploaded from the Template studio. PDF page dimensions are preserved; the built-in sample layout defaults to A4 with editable physical dimensions. Image and DOCX backgrounds are not accepted, and DOCX conversion is absent.

Coordinates use points (72 pt per inch), with top-left origin; the renderer converts to PDF coordinates. Zoom changes only screen display. Drag/resize fields, edit X/Y/width/height, color, font family, font size, alignment and overflow. Arrow keys move 1 pt; Shift moves 10 pt. Optional snap is 2 pt; undo/redo and unsaved-change prompts are included.

Field keys: school_name, full_name, student_code, class, grade, section, year, term, subject_table, total, max_total, average, section_rank, grade_rank, issue_date, approver, template_revision, report_ref. Required: full_name, student_code, subject_table, average, section_rank. Logos/signatures can be part of the background; dynamic image fields are not included.

Geometry checks require nonoverlap, bounds, unique keys, at least 8 pt fonts, required mappings and adequate subject-table height. Table rows are 28 pt. Overflow can wrap, shrink no smaller than 8 pt, or fail for more than one line. Actual text overflow fails the export rather than silently clipping. Editing an approved template produces a new DRAFT version.

Preview renders up to three long-name students from the newest result snapshot. Final jobs require current APPROVED results and template. Standard Latin PDF fonts and embedded Noto Sans Ethiopic support tested English/Amharic names. Other scripts need additional fonts. The font license is in public/fonts/OFL.txt.

Each student receives one page in their section PDF. ZIPs contain separate grade/section paths, optional individual PDFs and a checksum/count manifest. Allegations and teacher remarks are excluded. Print sample pages at 100% scale and verify the official school template before live use.
