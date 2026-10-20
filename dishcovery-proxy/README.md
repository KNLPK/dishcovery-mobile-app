# dishcovery-proxy

Express server between the Dishcovery app and its recipes (Spoonacular on the
laptop, the generated catalog when hosted). It re-encodes every
recipe as JSON, MessagePack or Protocol Buffers, and serves the benchmark
dataset. Node 22.6 or newer: `npm ci`, then `npm start` (port 3001).

## Two modes

The mode is printed at startup as `[mode] LOCAL` or `[mode] HOSTED`.

**Local** (the laptop, and the mode used for the published measurements):
the full 250-payload dataset (100 Spoonacular + 150 generated), served from
local snapshots, with no rate limits. The key goes in `dishcovery-proxy/.env`
(see `.env.example`).

**Hosted** (the public demo, https://dishcovery-proxy.vercel.app): catalog
mode. The benchmark dataset is the 150 generated payloads, and browsing
(search, find by ingredients, the home categories) is answered from those same
150 Gemini-generated recipes, matched on title, ingredient names and summary.
It makes no Spoonacular calls and needs no API key; a recipe id outside the
catalog is a 404. Recipe detail uses the same encoders, so its bytes equal the
benchmark payloads. It is on when `DISHCOVERY_MODE=hosted`, and always on
Vercel or Render (`VERCEL` or `RENDER` is set there). `/health` shows the
mode, the catalog source and the dataset size.

On Vercel (`../vercel.json`, `api/index.js`) the same Express app runs as one
serverless function in `sin1`; `../.vercelignore` uploads only the proxy,
`shared/` and `fixtures/generated/`, never `.env` files or Spoonacular
payloads. No environment variables are set. The per-IP rate limit (1200
requests per 10 minutes) is kept in memory per function instance: each
instance counts on its own and a cold start resets it, so it is a soft limit.
`../scripts/test-catalog.mjs` checks catalog mode with no key and no network.
`../render.yaml` is the earlier Render setup, kept for reference.

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
