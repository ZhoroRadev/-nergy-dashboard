# Energy Trading Dashboard v4.0 — DAM + Intraday

## What is implemented
- `scripts/collect_dam.py`: ENTSO-E Transparency A44, Bulgarian bidding zone, A44 price document, parsing 15/30/60-minute intervals with proper timezone offsets and DST support. Requires `ENTSOE_API_TOKEN` (repository secret) and `MARKET_PUBLICATION_ALLOWED=true` (repository variable).
- `scripts/collect_intraday.py`: strict adapter for *licensed* Intraday continuous-trading VWAP JSON. Requires `IBEX_EXPORT_URL` secret, optional `IBEX_EXPORT_TOKEN` secret and `INTRADAY_PUBLICATION_ALLOWED=true` variable. No official vendor URL is guessed; endpoint mapping is subject to your actual contract.
- `.github/workflows/market-prices.yml`: hourly job plus manual trigger, writes only source-confirmed authorized snapshots.
- `assets/app.js` and `index.html`: fetch `data/dam.json` + `data/intraday.json` if available, show source; CSV import in browser overrides automatic files temporarily.

## IMPORTANT: License and privacy
IBEX market data access is contractual. Internal-use licenses do NOT allow publishing prices in a public GitHub Pages repository. **Do not enable `INTRADAY_PUBLICATION_ALLOWED` for an internal-use-only feed.** If you cannot publish data, keep Intraday local via the CSV import or host the tool privately with authenticated access. ENTSO-E terms should also be checked before public republication; `MARKET_PUBLICATION_ALLOWED` is OFF by default.

## Installation
Upload only `index.html`, `assets/app.js`, `scripts/collect_dam.py`, `scripts/collect_intraday.py` and `.github/workflows/market-prices.yml` to the matching paths. Keep existing ESO workflow and scripts unchanged. GitHub web upload often does not preserve hidden `.github` directories; create the workflow in the GitHub file editor if necessary.

## Secrets and variables
GitHub → Settings → Secrets and variables → Actions:
- Secrets: `ENTSOE_API_TOKEN` (when received), `IBEX_EXPORT_URL` and optional `IBEX_EXPORT_TOKEN` (only after an authorized data service is available).
- Variables: `MARKET_PUBLICATION_ALLOWED` (`true` only if permitted) and `INTRADAY_PUBLICATION_ALLOWED` (`true` only with explicit redistribution rights). Absence = disabled.

## Expected normalized licensed Intraday JSON input
```json
{"records":[{"timestamp":"2026-11-05T13:00:00+02:00","intraday_eur_mwh":120.5,"interval_minutes":15,"volume_mwh":22.4}]}
```
The example is schema documentation, not a real market observation. Mapping from an actual IBEX API/FTP response is required after you have access. The price field represents **volume-weighted average price (VWAP)**, not the latest transaction price; do not mix it with other metrics.

## Checks
- `python -m py_compile scripts/collect_dam.py scripts/collect_intraday.py`
- `python scripts/collect_dam.py` and `python scripts/collect_intraday.py` should print `SKIP` without credentials, with no fabricated data files.
- Workflow dispatch should finish successfully and skip disabled sources.

## Data quality
ENTSO-E data may be delayed, revised or have DST 23/25-hour delivery days. Use UTC offset timestamps for identity. The existing CSV model has one price per timestamp and does not calculate true interval-volume-weighted daily averages. Keep the market-specific KPIs separate when making actual trading decisions.
