import { compact, formatCard, cardStatus, freshness, layout, nearestIndex, linePath, areaPath, shortDate } from "/lib.js";

const NS = "http://www.w3.org/2000/svg";
const H = 260;
const PAD = { top: 16, right: 52, bottom: 28, left: 40 };
let W = 720; // real pixel width of the chart box, so text keeps its size on a phone
const $ = (id) => document.getElementById(id);

const STATUS_TEXT = { ok: "Healthy", warning: "Watch", critical: "Problem" };
const STATUS_ICON = { ok: "✓", warning: "!", critical: "✕" };

function el(name, attrs = {}, text) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok && res.status !== 503) throw new Error(url + " " + res.status);
  return res.json();
}

/* ---------- visitors ---------- */
function renderVisitors(d) {
  const ok = d.counters_available !== false;
  $("total-visits").textContent = ok ? compact(d.total_visits) : "—";
  $("unique-visitors").textContent = ok ? compact(d.unique_visitors) : "—";
  $("today-visits").textContent = ok ? compact(d.today_visits) : "—";
  $("today-unique").textContent = ok ? compact(d.today_unique_visitors) : "—";
  const note = $("visit-note");
  note.hidden = ok;
  if (!ok) note.textContent = "Live counters are temporarily unavailable. History is still shown.";
}

/* ---------- history chart ---------- */
let rows = [];

function renderChart() {
  const svg = $("chart");
  svg.replaceChildren();
  W = Math.max(280, Math.round($("chart-wrap").clientWidth || 720));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  const empty = rows.length === 0;
  $("chart-empty").hidden = !empty;
  svg.style.display = empty ? "none" : "";
  renderTable();
  if (empty) return;

  const l = layout(rows, { width: W, height: H, pad: PAD });
  svg.append(el("title", { id: "chart-title" }, `Daily visits and unique visitors, ${rows.length} days`));

  for (const t of l.ticks) {
    svg.append(el("line", { x1: PAD.left, x2: W - PAD.right, y1: t.y, y2: t.y, stroke: t.v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
    svg.append(el("text", { x: PAD.left - 8, y: t.y + 4, "text-anchor": "end", fill: "var(--ink-3)", "font-size": 11 }, compact(t.v)));
  }
  const maxLabels = W < 420 ? 4 : 7;
  const step = Math.max(1, Math.ceil(rows.length / maxLabels));
  rows.forEach((r, i) => {
    if ((rows.length - 1 - i) % step === 0) {
      svg.append(el("text", { x: l.x(i), y: H - 8, "text-anchor": i === rows.length - 1 ? "end" : i === 0 ? "start" : "middle", fill: "var(--ink-3)", "font-size": 11 }, shortDate(r.date)));
    }
  });

  const base = l.y(0);
  svg.append(el("path", { d: areaPath(l.visits, base), fill: "var(--series-1)", opacity: 0.1 }));
  svg.append(el("path", { d: linePath(l.visits), fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  svg.append(el("path", { d: linePath(l.uniques), fill: "none", stroke: "var(--series-2)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

  // Direct labels on the last point only: the legend and tooltip carry the rest.
  for (const [pts, color, name] of [[l.visits, "var(--series-1)", "Visits"], [l.uniques, "var(--series-2)", "Unique"]]) {
    const p = pts[pts.length - 1];
    svg.append(el("circle", { cx: p.x, cy: p.y, r: 4, fill: color, stroke: "var(--surface)", "stroke-width": 2 }));
    svg.append(el("text", { x: p.x + 8, y: p.y + 4, fill: "var(--ink-2)", "font-size": 12 }, compact(p.v)));
    svg.lastChild.setAttribute("aria-label", name);
  }

  // Hover / focus layer: a crosshair that snaps to the nearest day, one tooltip for both series.
  const cross = el("line", { y1: PAD.top, y2: base, stroke: "var(--ink-3)", "stroke-width": 1, visibility: "hidden" });
  const dotA = el("circle", { r: 4, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" });
  const dotB = el("circle", { r: 4, fill: "var(--series-2)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" });
  svg.append(cross, dotA, dotB);
  const hit = el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" });
  svg.append(hit);

  const show = (i) => {
    const a = l.visits[i], b = l.uniques[i];
    cross.setAttribute("x1", a.x); cross.setAttribute("x2", a.x); cross.setAttribute("visibility", "visible");
    dotA.setAttribute("cx", a.x); dotA.setAttribute("cy", a.y); dotA.setAttribute("visibility", "visible");
    dotB.setAttribute("cx", b.x); dotB.setAttribute("cy", b.y); dotB.setAttribute("visibility", "visible");
    const tip = $("tooltip");
    tip.replaceChildren();
    const date = document.createElement("div"); date.className = "date"; date.textContent = shortDate(rows[i].date);
    tip.append(date, tipRow("var(--series-1)", "Visits", rows[i].visits), tipRow("var(--series-2)", "Unique visitors", rows[i].uniques));
    tip.style.left = Math.min(Math.max(a.x, 80), W - 80) + "px";
    tip.style.top = Math.max(0, Math.min(a.y, b.y) - 84) + "px";
    tip.hidden = false;
  };
  const hide = () => {
    for (const n of [cross, dotA, dotB]) n.setAttribute("visibility", "hidden");
    $("tooltip").hidden = true;
  };
  const atPointer = (e) => {
    const box = svg.getBoundingClientRect();
    return nearestIndex(l.visits, e.clientX - box.left);
  };
  hit.addEventListener("pointermove", (e) => show(atPointer(e)));
  hit.addEventListener("pointerleave", hide);

  // Keyboard: the same readout as hover.
  let cur = rows.length - 1;
  svg.setAttribute("tabindex", "0");
  svg.onkeydown = (e) => {
    if (e.key === "ArrowLeft") cur = Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") cur = Math.min(rows.length - 1, cur + 1);
    else if (e.key === "Escape") return hide();
    else return;
    e.preventDefault();
    show(cur);
  };
  svg.onblur = hide;
}

function tipRow(color, name, value) {
  const row = document.createElement("div"); row.className = "row";
  const left = document.createElement("span");
  const key = document.createElement("span"); key.className = "key"; key.style.background = color;
  left.append(key, document.createTextNode(name));
  const v = document.createElement("strong"); v.textContent = compact(value);
  row.append(left, v);
  return row;
}

function renderTable() {
  const body = document.querySelector("#history-table tbody");
  body.replaceChildren();
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const [text, cls] of [[shortDate(r.date), ""], [compact(r.visits), "num"], [compact(r.uniques), "num"]]) {
      const td = document.createElement("td"); td.textContent = text; if (cls) td.className = cls; tr.append(td);
    }
    body.append(tr);
  }
}

$("toggle-table").addEventListener("click", (e) => {
  const showTable = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(showTable));
  e.currentTarget.textContent = showTable ? "View as chart" : "View as table";
  $("table-wrap").hidden = !showTable;
  $("chart-wrap").hidden = showTable;
  $("chart-empty").hidden = showTable || rows.length > 0;
});

/* ---------- platform cards ---------- */
async function loadMetrics() {
  const box = $("cards");
  try {
    const m = await getJSON("/metrics/metrics.json?_=" + Math.floor(Date.now() / 30000));
    const f = freshness(m.updatedAt);
    $("freshness").textContent = "Platform data updated " + f.label;
    box.classList.toggle("stale", f.stale);
    box.replaceChildren(...m.cards.map(metricCard));
  } catch {
    $("freshness").textContent = "Platform data unavailable";
    box.replaceChildren();
    const p = document.createElement("p"); p.className = "empty"; p.textContent = "Metrics are not available right now.";
    box.append(p);
  }
}

function metricCard(card) {
  const f = formatCard(card);
  const status = cardStatus(card);
  const wrap = document.createElement("div");
  wrap.className = "metric" + (f.empty ? " empty-val" : "");
  const label = document.createElement("span"); label.className = "label"; label.textContent = card.title;
  const value = document.createElement("span"); value.className = "m-value"; value.textContent = f.text;
  const img = document.createElement("img"); img.src = card.image; img.alt = ""; img.loading = "lazy";
  wrap.append(label, value);
  const note = document.createElement("span");
  if (f.empty) { note.className = "status"; note.textContent = "No data yet"; }
  else if (status) { note.className = "status " + status; note.textContent = STATUS_ICON[status] + " " + STATUS_TEXT[status]; }
  wrap.append(note, img);
  return wrap;
}

/* ---------- boot ---------- */
async function loadVisit() {
  $("chart-wrap").classList.add("loading");
  try {
    const d = await getJSON("/api/visit");
    renderVisitors(d);
    rows = d.history || [];
  } catch {
    $("visit-note").hidden = false;
    $("visit-note").textContent = "The API is not reachable right now.";
    rows = [];
  }
  $("chart-wrap").classList.remove("loading");
  renderChart();
}

let lastWidth = 0;
new ResizeObserver(() => {
  const w = $("chart-wrap").clientWidth;
  if (w && Math.abs(w - lastWidth) > 4 && rows.length) { lastWidth = w; renderChart(); }
}).observe($("chart-wrap"));

loadVisit();
loadMetrics();
setInterval(loadMetrics, 60000);
