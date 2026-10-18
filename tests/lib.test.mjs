import test from "node:test";
import assert from "node:assert/strict";
import { compact, formatCard, cardStatus, freshness, niceMax, layout, nearestIndex, linePath, areaPath, shortDate } from "../src/lib.js";

test("compact numbers", () => {
  assert.equal(compact(0), "0");
  assert.equal(compact(1284), "1,284");
  assert.equal(compact(12900), "12.9K");
  assert.equal(compact(4200000), "4.2M");
  assert.equal(compact(null), "—");
  assert.equal(compact(undefined), "—");
});

test("formatCard handles null as empty, not zero", () => {
  assert.deepEqual(formatCard({ unit: "%", value: null }), { text: "—", empty: true });
  assert.equal(formatCard({ unit: "%", value: 0 }).text, "0%");
  assert.equal(formatCard({ unit: "s", value: 0.1234 }).text, "123 ms");
  assert.equal(formatCard({ unit: "s", value: 2.345 }).text, "2.35 s");
  assert.equal(formatCard({ unit: "req", value: 15300 }).text, "15.3K");
  assert.equal(formatCard({ unit: "", value: 2 }).text, "2");
});

test("cardStatus thresholds and missing data", () => {
  assert.equal(cardStatus({ key: "errors5xx", value: 0.2 }), "ok");
  assert.equal(cardStatus({ key: "errors5xx", value: 2 }), "warning");
  assert.equal(cardStatus({ key: "errors5xx", value: 9 }), "critical");
  assert.equal(cardStatus({ key: "healthy", value: 0 }), "critical");
  assert.equal(cardStatus({ key: "healthy", value: 2 }), "ok");
  assert.equal(cardStatus({ key: "requests", value: 5 }), null);
  assert.equal(cardStatus({ key: "latency", value: null }), null);
});

test("freshness", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  assert.deepEqual(freshness("2026-10-18T11:59:55Z", now), { label: "just now", stale: false });
  assert.deepEqual(freshness("2026-10-18T11:59:00Z", now), { label: "60 s ago", stale: false });
  assert.deepEqual(freshness("2026-10-18T11:55:00Z", now), { label: "5 min ago", stale: true });
  assert.deepEqual(freshness("garbage", now), { label: "unknown", stale: true });
});

test("niceMax", () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(42), 50);
  assert.equal(niceMax(120), 200);
  assert.equal(niceMax(1001), 2000);
});

const rows = [
  { date: "2026-10-16", visits: 10, uniques: 4 },
  { date: "2026-10-17", visits: 50, uniques: 20 },
  { date: "2026-10-18", visits: 30, uniques: 12 },
];
const box = { width: 600, height: 200, pad: { top: 10, right: 20, bottom: 30, left: 40 } };

test("layout maps data inside the plot area", () => {
  const l = layout(rows, box);
  assert.equal(l.max, 50);
  assert.equal(l.visits[0].x, 40);
  assert.equal(l.visits[2].x, 580);
  assert.equal(l.visits[1].y, 10);             // max value sits on the top edge
  assert.equal(l.y(0), 170);                    // zero sits on the baseline
  assert.equal(l.ticks.length, 5);
});

test("single data point is centered, empty input does not throw", () => {
  const l = layout([rows[0]], box);
  assert.equal(l.visits[0].x, 40 + 540 / 2);
  assert.doesNotThrow(() => layout([], box));
  assert.equal(areaPath([], 170), "");
});

test("nearestIndex snaps to the closest day", () => {
  const l = layout(rows, box);
  assert.equal(nearestIndex(l.visits, 0), 0);
  assert.equal(nearestIndex(l.visits, 300), 1);
  assert.equal(nearestIndex(l.visits, 9999), 2);
});

test("paths", () => {
  const l = layout(rows, box);
  assert.match(linePath(l.visits), /^M40\.0 /);
  assert.match(areaPath(l.visits, 170), / Z$/);
});

test("shortDate has no timezone shift", () => {
  assert.equal(shortDate("2026-10-01"), "Oct 1");
  assert.equal(shortDate("2026-12-31"), "Dec 31");
});
