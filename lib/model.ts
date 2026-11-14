// Token Radar — radar-2 model.
// Ranks pre-token protocols by an implied launch value derived from the
// snapshot's own figures: TVL, a category multiple taken from live-token
// market-cap / TVL ratios, seven-day TVL growth, age since listing and the
// number of chains. No protocol name is special-cased.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  rank: number;
  implied_value_usd: number;
  watchlist: boolean;
  comp: number;
  growth: number;
  maturity: number;
  chains_mult: number;
  farm_steps: string[];
}

export interface CategoryMultiple {
  category: string;
  comp: number;
  live_count: number;
  median_ratio: number;
}

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function median(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** Whole days from listed_at to the snapshot's as_of date; null when unlisted. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const start = Date.parse(listedAt + "T00:00:00Z");
  const end = Date.parse(asOf + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function growthFactor(change7d: number | null): number {
  const c = change7d === null || change7d === undefined ? 0 : change7d;
  return 1 + (clamp(c, -60, 120) / 100) * 0.5;
}

export function maturityFactor(age: number | null): number {
  const a = age === null || age === undefined ? 365 : age;
  return 0.6 + (Math.min(a, 1095) / 1095) * 0.4;
}

export function chainsFactor(chainCount: number): number {
  return 1 + 0.02 * Math.min(Math.max(chainCount - 1, 0), 5);
}

/**
 * Category multiples. For each category, the median of the live-token
 * protocols' mcap/TVL ratios, each ratio winsorised at 10, shrunk toward the
 * global median with weight n/(n+10); the global median when n < 2.
 * Clamped to [0.05, 1.0] and rounded to 4 decimals.
 */
export function categoryMultiples(
  protocols: Protocol[],
): { comps: Map<string, number>; table: CategoryMultiple[]; globalMedian: number } {
  const live = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const allRatios = live.map((p) => Math.min((p.mcap_usd as number) / p.tvl_usd, 10));
  const globalMedian = median(allRatios);
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const cat = p.category ?? "Uncategorised";
    const list = byCategory.get(cat) ?? [];
    list.push(Math.min((p.mcap_usd as number) / p.tvl_usd, 10));
    byCategory.set(cat, list);
  }
  const comps = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  for (const [cat, ratios] of byCategory) {
    const n = ratios.length;
    const med = median(ratios);
    const raw = n < 2 ? globalMedian : (n / (n + 10)) * med + (10 / (n + 10)) * globalMedian;
    const comp = Math.round(clamp(raw, 0.05, 1.0) * 10000) / 10000;
    comps.set(cat, comp);
    table.push({ category: cat, comp, live_count: n, median_ratio: Math.round(med * 10000) / 10000 });
  }
  table.sort((a, b) => b.comp - a.comp || a.category.localeCompare(b.category));
  return { comps, table, globalMedian: Math.round(globalMedian * 10000) / 10000 };
}

export function impliedValue(
  p: Protocol,
  comps: Map<string, number>,
  globalMedian: number,
  asOf: string,
): { value: number; comp: number; growth: number; maturity: number; chainsMult: number; age: number | null } {
  const comp = comps.get(p.category ?? "Uncategorised") ?? globalMedian;
  const age = ageDays(p.listed_at, asOf);
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(age);
  const chainsMult = chainsFactor(p.chains.length);
  const value = Math.max(
    1,
    Math.round(p.tvl_usd * comp * growth * maturity * chainsMult),
  );
  return { value, comp, growth, maturity, chainsMult, age };
}

/** A protocol records no token and is not a wrapped/staked/bridged product. */
export function isRankable(p: Protocol): boolean {
  if (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return false;
  }
  return true;
}

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function categoryAction(p: Protocol): string {
  const c = (p.category ?? "").toLowerCase();
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) return "supply USDC to its lending market";
  if (c.includes("dex") || c.includes("yield") || c.includes("leveraged")) return "provide liquidity to its main pool";
  if (c.includes("bridge")) return "bridge USDC into it from another chain";
  if (c.includes("stak") || c.includes("restak")) return "stake assets through its staking flow";
  if (c.includes("perpetual") || c.includes("deriv")) return "deposit margin and open a small hedged position";
  if (c.includes("prediction")) return "fund the account and place a small prediction position";
  if (c.includes("curator") || c.includes("allocator") || c.includes("capital")) return "deposit into its vault";
  if (c.includes("stable")) return "mint or deposit its stable asset";
  if (c.includes("rwa")) return "mint its yield-bearing asset";
  if (c.includes("insurance")) return "buy cover for a position you already hold";
  if (c.includes("chain")) return "bridge in and use it in one live app";
  return "deposit USDC into its main product";
}

/** Six concrete farm steps, each 20-600 chars, with cost and time stated. */
export function farmPlan(p: Protocol, age: number | null): string[] {
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDays(age);
  const gas = capital >= 150 ? 8 : 4;
  const action = categoryAction(p);
  return [
    `Create a fresh wallet for this farm and write its seed phrase on paper, kept offline. Cost: $0. Time: 10 minutes.`,
    `From the fresh wallet, ${action} with $${capital} on ${p.name}. Cost: $${capital} + $${gas} gas. Time: 15 minutes.`,
    `Do one qualifying action every week — a deposit, swap, vote or borrow — so activity stays regular. Cost: $${gas} gas per week. Time: 15 minutes weekly.`,
    `Keep the position open for at least ${hold} days; do not withdraw the principal early. Cost: $0. Time: ${hold} days.`,
    `Check ${p.name}'s official points or rewards page weekly and claim only through links on its official site; never pay anyone to claim for you. Cost: $0. Time: 10 minutes weekly.`,
    `Plan the exit: set aside $${gas} for gas, unwind the position in one transaction, and record the wallet, date and transaction hash. Cost: $${gas} gas. Time: 20 minutes.`,
  ];
}

/** The board: every watchlist slug plus every other rankable protocol. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { comps, globalMedian } = categoryMultiples(snapshot.protocols);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!watch.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const rows: BoardRow[] = [];
  for (const p of chosen.values()) {
    const r = impliedValue(p, comps, globalMedian, snapshot.as_of);
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: r.age,
      rank: 0,
      implied_value_usd: r.value,
      watchlist: watch.has(p.slug),
      comp: r.comp,
      growth: r.growth,
      maturity: r.maturity,
      chains_mult: r.chainsMult,
      farm_steps: farmPlan(p, r.age),
    });
  }
  rows.sort(
    (a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/** The gate's own checks, in one place. Returns a message or null when clean. */
export function boardIssue(snapshot: Snapshot, rows: BoardRow[]): string | null {
  if (rows.length < 100) return `board has ${rows.length} rows, fewer than 100`;
  const slugs = new Set(rows.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} missing from board`;
  }
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not 1..N (position ${i} is ${ranks[i]})`;
  }
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) {
      return `implied value rises from rank ${byRank[i - 1].rank} to ${byRank[i].rank}`;
    }
  }
  const distinct = new Set(rows.map((r) => r.implied_value_usd));
  if (distinct.size < 2) return "all implied values are identical";
  for (const row of rows) {
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has a non-positive implied value`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps?.length ?? 0} farm steps`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} chars`;
    }
  }
  return null;
}

/** The 24 live-token protocols with the largest market cap, for the dashboard's separate tab. */
export function liveTokens(snapshot: Snapshot): Protocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 24);
}
