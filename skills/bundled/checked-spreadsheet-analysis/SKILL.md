---
name: checked-spreadsheet-analysis
description: Reconcile CSV data, verify exact totals and produce an editable spreadsheet with source and coverage receipts.
license: MIT
---
# Checked spreadsheet analysis

1. Read the original source, headers, units, currencies, time range and requested calculation. Preserve original inputs. If data is truncated or ambiguous, name the limitation.
2. Use table_summary on the original CSV for exact decimal totals, with explicit grouping and equality filters. Keep currencies and units separate. Inspect matched and excluded counts and source hashes; do not independently guess totals from a preview.
3. Separate a policy interpretation from arithmetic. Cite the user's supplied policy and flag ambiguous exceptions. Never label an inferred reimbursement decision “approved.”
4. Create a separate analysis CSV with source IDs and explanatory columns. Export a new workbook with spreadsheet_export. Use numberColumns only for verified numerical columns, never formula-like user input.
5. Check totals and row coverage against the source receipt, not a copy you rewrote. Verify the resulting file with task_verify and link it in the final response. Export receipts prove bytes/counts, not spreadsheet visual layout or policy correctness.
6. If Excel/Office/OCR is needed but unavailable, disclose that requirement. Do not claim this skill installs those engines.

## Provenance

Original OpenBot method. Instructions are bundled with OpenBot and do not grant tool or account permissions. See LICENSE for reuse terms.
