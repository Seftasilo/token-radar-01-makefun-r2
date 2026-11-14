// Token Radar — entrypoint.
// Reads the sealed snapshot, builds the radar-2 board, and writes the
// dashboard's data, the board, the screenshots and the dossier.
import * as fs from "node:fs";
import * as path from "node:path";
import { buildBoard, boardIssue, categoryMultiples, liveTokens } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function parseArgs(argv: string[]): { input: string } {
  let input = "/input/snapshot.json";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && i + 1 < argv.length) input = argv[++i];
  }
  return { input };
}

function copyTree(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name.startsWith(".")) continue;
    const from = path.join(src, name);
    const to = path.join(dst, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyTree(from, to);
    else if (st.isFile()) fs.copyFileSync(from, to);
  }
}

function main(): void {
  const { input } = parseArgs(process.argv.slice(2));
  const inputPath = fs.statSync(input).isDirectory()
    ? path.join(input, "snapshot.json")
    : input;
  const snapshot: Snapshot = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });

  const rows = buildBoard(snapshot);
  const issue = boardIssue(snapshot, rows);
  if (issue !== null) throw new Error(`board rejected: ${issue}`);

  const { table, globalMedian } = categoryMultiples(snapshot.protocols);
  const live = liveTokens(snapshot);
  const watchlistCount = snapshot.watchlist.length;
  const earlyCount = rows.length - watchlistCount;

  // board.json — the ranked board the gate reads.
  const board = { rows };
  fs.writeFileSync(path.join(outDir, "board.json"), JSON.stringify(board, null, 2) + "\n");

  // data.js — everything the dashboard renders, beside the page.
  const data = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: "radar-2",
    watchlist_count: watchlistCount,
    early_count: earlyCount,
    global_median: globalMedian,
    categories: table.slice(0, 8),
    live: live.map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
    })),
    rows,
  };
  fs.writeFileSync(
    path.join(outDir, "data.js"),
    "window.RADAR = " + JSON.stringify(data) + ";\n",
  );

  // dashboard/ and screenshots/ — copied whole, dot-names skipped.
  const root = path.dirname(new URL(import.meta.url).pathname);
  copyTree(path.join(root, "dashboard"), path.join(outDir, "dashboard"));
  const shotDir = path.join(root, "screenshots");
  const shots = fs
    .readdirSync(shotDir)
    .filter((n) => !n.startsWith("."))
    .sort();
  if (shots.length < 3) throw new Error(`only ${shots.length} screenshots, need at least 3`);
  for (const name of shots) {
    if (!SCREENSHOT_NAME.test(name)) throw new Error(`bad screenshot name: ${name}`);
  }
  copyTree(shotDir, path.join(outDir, "screenshots"));

  // dossier.json — the judge's reading copy, built by the kit's library.
  // Rebuild it immediately and refuse to finish if the two copies differ,
  // so a stale or partial dossier can never ship.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  const rebuilt = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  if (!Buffer.from(dossier).equals(Buffer.from(rebuilt))) {
    throw new Error("dossier rebuild differs from the written dossier");
  }
  fs.writeFileSync(path.join(outDir, "dossier.json"), dossier);

  console.log(
    `radar-2: ${rows.length} rows (${watchlistCount} watchlist + ${earlyCount} early), ` +
      `top ${rows[0].name} $${rows[0].implied_value_usd.toLocaleString("en-US")}, ` +
      `${shots.length} screenshots, dossier ${dossier.length} bytes`,
  );
}

main();
