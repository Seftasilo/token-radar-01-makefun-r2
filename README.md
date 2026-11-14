# Token Radar — build the best token launch radar (token-radar-01)

A Node 22 program that reads the sealed DefiLlama snapshot (`/input/snapshot.json`),
ranks every pre-token protocol by an implied launch value, and writes a static
dashboard a reader can use to pick what to farm next.

## The model (radar-2)

Implied value is not a flat TVL multiple. Each category's multiple is the market's
own: the median market-cap / TVL ratio of the snapshot's live-token protocols in
that category, shrunk toward the global median when the category has few live
comps, and the global median when it has fewer than two. Then:

```
implied = round( tvl_usd x comp(category)
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.02 x min(chains - 1, 5)) )
```

Age is the time since the protocol was first listed — how long it has run with no
token on record. Wrapped, staked and bridged products of tokens that already trade
are left off the board entirely: they are not protocols waiting on a launch of
their own. No protocol name is special-cased; the same function scores every row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Writes `out/board.json` (198 rows: the 40-protocol watchlist plus every other
rankable pre-token protocol), `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json` (built with the kit's vendored `vendor/makefun-board.ts`).

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard,
  screenshots and dossier.
- `lib/model.ts` — the radar-2 model, the farm-plan generator and the gate checks.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.
- `dashboard/` — the static page (index.html, app.css, app.js); no network, no
  framework. Search, category and chain filters, a watchlist-only toggle,
  sortable columns, a live-token tab, a per-protocol detail drawer with the
  model's full breakdown and a six-step farm plan, and a methodology section
  with the category multiples table.
- `screenshots/` — the board, a protocol detail view and a filtered view,
  rendered from the dashboard itself at 1440x900.

Implied value is this entry's own claim, never make.fun's. A protocol "records no
token" means its DefiLlama record carries none — not proof it has none.
