// Pure helpers (no DOM) so they can be unit-tested with Node.

/** 1,284 / 12.9K / 4.2M. Null-safe. */
export function compact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return trim(n / 1e6) + "M";
  if (abs >= 1e4) return trim(n / 1e3) + "K";
  return Math.round(n).toLocaleString("en-US");
}

function trim(x) {
  return (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString();
}

/** Formats a metric card value by unit. Null means "no datapoint yet". */
export function formatCard(card) {
  const v = card.value;
  if (v === null || v === undefined) return { text: "—", empty: true };
  switch (card.unit) {
    case "%":
      return { text: (Math.round(v * 10) / 10).toString() + "%", empty: false };
    case "s":
      return { text: v < 1 ? Math.round(v * 1000) + " ms" : (Math.round(v * 100) / 100) + " s", empty: false };
    case "req":
      return { text: compact(v), empty: false };
    default:
      return { text: (Math.round(v * 10) / 10).toString(), empty: false };
  }
}

/** Status for cards where a threshold means something. Returns null for neutral cards. */
export function cardStatus(card) {
  const v = card.value;
  if (v === null || v === undefined) return null;
  const rule = {
    errors5xx: [1, 5],
    errors4xx: [10, 25],
    latency: [0.5, 1.5],
    node_cpu: [70, 85],
    cache_cpu: [60, 80],
  }[card.key];
  if (card.key === "healthy") return v >= 1 ? "ok" : "critical";
  if (!rule) return null;
  if (v < rule[0]) return "ok";
  return v < rule[1] ? "warning" : "critical";
}

/** Seconds since the Lambda wrote the snapshot; null if unparsable. */
export function ageSeconds(updatedAt, now = Date.now()) {
  const t = Date.parse(updatedAt);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((now - t) / 1000));
}

/** "just now" / "42 s ago" / "5 min ago". Stale after 3 minutes (the Lambda runs every minute). */
export function freshness(updatedAt, now = Date.now()) {
  const s = ageSeconds(updatedAt, now);
  if (s === null) return { label: "unknown", stale: true };
  if (s < 10) return { label: "just now", stale: false };
  if (s < 90) return { label: s + " s ago", stale: false };
  const m = Math.round(s / 60);
  return { label: m + " min ago", stale: s > 180 };
}

/** Nice round upper bound for an axis: 1, 2, 5 × 10^n. */
export function niceMax(max) {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/** Scales history rows into SVG coordinates. Returns points per series and axis ticks. */
export function layout(rows, { width, height, pad }) {
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...rows.map((r) => Math.max(r.visits, r.uniques))));
  const x = (i) => pad.left + (rows.length <= 1 ? innerW / 2 : (i * innerW) / (rows.length - 1));
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const pts = (key) => rows.map((r, i) => ({ x: x(i), y: y(r[key]), v: r[key], date: r.date }));
  const ticks = [0, 1, 2, 3, 4].map((k) => ({ v: (max * k) / 4, y: y((max * k) / 4) }));
  return { max, visits: pts("visits"), uniques: pts("uniques"), ticks, x, y, innerW, innerH };
}

/** Index of the data point nearest to a pointer x (in SVG units). */
export function nearestIndex(points, px) {
  let best = 0;
  let dist = Infinity;
  points.forEach((p, i) => {
    const d = Math.abs(p.x - px);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

export function linePath(points) {
  return points.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
}

export function areaPath(points, baselineY) {
  if (!points.length) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return linePath(points) + ` L${last.x.toFixed(1)} ${baselineY} L${first.x.toFixed(1)} ${baselineY} Z`;
}

/** "Oct 17" from "2026-10-17" without timezone shifts. */
export function shortDate(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] + " " + d;
}
