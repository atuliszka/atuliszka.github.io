Agatio Games

## Peasant to King community report

The homepage hero and game subpage both fetch `public/data/community-stats.json`.
The hero shows three totals between the title and trailer on desktop,
and in a compact strip below the title on mobile;
the subpage shows all eight totals and ranks. Neither page links to the raw file.
Both layouts update eligible estimates while visible; player counts remain reported.
This static site serves that exact path (there is no build step that strips `public/`).
The supplied report was moved from `games/peasant-to-king/community-stats.json`;
keep only the public file as the source of truth.

Weekly publishing:

1. Replace `public/data/community-stats.json` with the new report. Keep the older
   cumulative snapshot in `previous` (or use `null` if none is available).
2. Set `updated_at` to the actual publication time as an ISO timestamp with an
   explicit timezone, preferably UTC, e.g. `2026-09-28T12:45:02Z`. Set snapshot
   `data_through` dates to their actual coverage cutoffs, not publication dates.
3. Deploy through the usual website deployment. No component edits are needed.

Use `status: "awaiting_data"` until a report is available. Zero means zero; use
`null` for unavailable totals. Ranks and milestone/player counts stay actual.
Only the listed harvesting, manual forging, and contract activity keys can be
projected. Keep `presentation.max_projection_days` at `1` for the current one-day
cap, and supply a readable `estimate_label`. Projections use calendar dates in UTC
for the snapshot gap and start at `updated_at`, shared by all visitors. Reduced
motion disables projections and count-up. Estimates are checked every 100 milliseconds
only while visible and growing; digits update only when the integer total changes.
They freeze at the cap; no totals are persisted between visits.

The JSON fetch omits credentials and uses `cache: "no-cache"` to revalidate using
normal HTTP caching on each page visit/reload. A deployed report reaches visitors
after the hosting cache refreshes; an already open page reads the new report on
reload. No service worker or separate statistics cache is used.

Preview with `serve-local.bat` so the JSON report loads automatically over HTTP.

Run statistics checks with
`node --test tests/community-stats.test.mjs`.
