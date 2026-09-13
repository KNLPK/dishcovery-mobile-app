# quarantine/

Raw API responses that cost real quota and belong in the audit trail, but that
are NOT part of any dataset procedure and must never be loaded as fixtures.

## generated-single-item-orphans/  (25 files)

Verbatim Gemini responses from the ORIGINAL single-document generation run
(started 2026-09-12 03:05 UTC, model gemini-3.6-flash). That run was believed
stopped, but killing its shell wrapper did not kill the node process; it kept
cycling on per-day 429s and, when the quota reset at 07:00 UTC on 2026-09-12,
resumed generating single documents (files 9000018-attempt3 through
9000036-attempt3, 07:13–07:52 UTC) in parallel with the batch pilot. They
consumed roughly 19 of that day's 20 requests.

Excluded because they were produced by a different procedure (one document per
request, the pre-batch prompt template) and would create a procedural
inconsistency inside the generated stratum. Retained because the requests were
spent and their responses are evidence. Referenced from
fixtures/generated/manifest.json under `quarantine`.
