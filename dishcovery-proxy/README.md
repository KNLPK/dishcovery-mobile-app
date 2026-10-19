# dishcovery-proxy

Express server between the Dishcovery app and Spoonacular. It re-encodes every
recipe as JSON, MessagePack or Protocol Buffers, and serves the benchmark
dataset. Node 22.6 or newer: `npm ci`, then `npm start` (port 3001).

## Two modes

The mode is printed at startup as `[mode] LOCAL` or `[mode] HOSTED`.

**Local** (the laptop, and the mode used for the published measurements):
the full 250-payload dataset (100 Spoonacular + 150 generated), served from
local snapshots, with no rate limits. The key goes in `dishcovery-proxy/.env`
(see `.env.example`).

**Hosted** (the public demo on Render, see `../render.yaml`): the 150
generated payloads only, live Spoonacular data cached for at most 1 hour,
per-IP rate limits and a daily budget of 40 Spoonacular points. It is on when
`DISHCOVERY_MODE=hosted`, and always on Render (`RENDER` is set there).
`/health` shows the mode, the dataset size and the points left today.

## Local mode needs the Spoonacular snapshots

The 100 raw Spoonacular bodies in `fixtures/recipes-raw/` are no longer in
git: Spoonacular's terms do not allow redistributing them. Local mode and the
full paper protocol still need them, and get them in one of two ways:

- **Keep the local copy.** A checkout that already has
  `fixtures/recipes-raw/` keeps it; the folder is ignored, not deleted.
- **Re-fetch them** with `refetch.py` from the reproducibility package
  (github.com/KNLPK/dishcovery-benchmark-artifact). It needs your own key in
  `SPOONACULAR_API_KEY` and about 110 points of quota (1.1 per recipe):

  ```
  python dataset/spoonacular/refetch.py <path-to-this-repo>/fixtures/recipes-raw
  ```

  Re-fetched bodies can differ from the 2026-09-09 capture.

Without the snapshots, local mode starts with the 150 generated payloads only
and logs how many Spoonacular recipes it skipped. The benchmark screen then
warns that the dataset is not the 250 payloads the paper protocol needs.
