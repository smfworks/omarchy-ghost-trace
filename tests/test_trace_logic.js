#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "TraceLogic.js"), "utf8")
  .replace(/^\.pragma library\s*/, "");
const Trace = { Math, Date, Number, String, Array, Object, JSON, isFinite, console };
vm.createContext(Trace);
vm.runInContext(src, Trace);

const now = 1_700_000_000_000;

function visit(id, at, extra) {
  return Object.assign({
    kind: "workspace",
    id: "ws:" + id,
    workspaceId: id,
    name: String(id),
    label: "WS " + id,
    windows: [],
    visitedAt: at,
    source: "hyprland",
    presence: "live",
    detail: ""
  }, extra || {});
}

const demo = Trace.demoTrail(now);
assert.ok(demo.length >= 6 && demo.length <= 12, "demo trail is 6–12 ghosts");
demo.forEach(function(ghost) {
  assert.strictEqual(ghost.source, "demo");
  assert.strictEqual(ghost.presence, "demo");
  assert.strictEqual(Trace.presenceLabel(ghost), "DEMO");
  assert.strictEqual(Trace.jumpSpec(ghost).kind, "demo");
  assert.strictEqual(Trace.jumpSpec(ghost).argv.length, 0);
});

const empty = Trace.emptyState();
assert.strictEqual(Trace.trailMode(empty), "demo");
assert.strictEqual(Trace.trailLabel("demo"), "DEMO");
assert.strictEqual(Trace.trailLabel("live"), "LIVE");
assert.ok(Trace.statusLine(empty).indexOf("DEMO") !== -1);
assert.strictEqual(Trace.effectiveGhosts(empty, now).length, demo.length);

let ring = [];
ring = Trace.pushVisit(ring, visit(3, now), 8);
ring = Trace.pushVisit(ring, visit(3, now + 50), 8);
assert.strictEqual(ring.length, 1, "consecutive same workspace is deduped");
assert.strictEqual(ring[0].visitedAt, now + 50);

ring = Trace.pushVisit(ring, visit(1, now + 100), 8);
ring = Trace.pushVisit(ring, visit(7, now + 200), 8);
ring = Trace.pushVisit(ring, visit(1, now + 300), 8);
assert.strictEqual(ring.length, 4, "non-consecutive revisits stay in the ring");
assert.strictEqual(ring[0].workspaceId, 1);
assert.strictEqual(ring[1].workspaceId, 7);

let capped = [];
for (let i = 0; i < 20; i++)
  capped = Trace.pushVisit(capped, visit(i + 1, now + i), 8);
assert.strictEqual(capped.length, 8);
assert.strictEqual(Trace.clampCap(3), 6);
assert.strictEqual(Trace.clampCap(99), 12);

const liveState = {
  hyprlandReady: true,
  error: "",
  ring: ring,
  forceDemo: false
};
assert.strictEqual(Trace.trailMode(liveState), "live");
assert.strictEqual(Trace.trailLabel(Trace.trailMode(liveState)), "LIVE");
assert.ok(Trace.hasLiveVisits(ring));

const staleState = {
  hyprlandReady: false,
  error: "Hyprland IPC failed",
  ring: ring,
  forceDemo: false
};
assert.strictEqual(Trace.trailMode(staleState), "stale");
assert.strictEqual(Trace.trailLabel("stale"), "STALE");
assert.strictEqual(Trace.effectiveGhosts(staleState, now)[0].source, "hyprland");

const errState = {
  hyprlandReady: false,
  error: "Hyprland IPC failed",
  ring: [],
  forceDemo: false
};
assert.strictEqual(Trace.trailMode(errState), "err");
assert.strictEqual(Trace.trailLabel("err"), "ERR");
assert.ok(Trace.statusLine(errState).indexOf("ERR") !== -1);
assert.strictEqual(Trace.effectiveGhosts(errState, now)[0].source, "demo", "ERR still paints a DEMO trail");

const forced = { hyprlandReady: true, error: "", ring: ring, forceDemo: true };
assert.strictEqual(Trace.trailMode(forced), "demo");
assert.strictEqual(Trace.parsePayload('{"demo":true}').forceDemo, true);
assert.strictEqual(Trace.parsePayload("not-json").forceDemo, false);

const newest = Trace.ageOpacity(now, now, 0, 7);
const oldest = Trace.ageOpacity(now - Trace.MAX_AGE_MS, now, 6, 7);
assert.ok(newest > oldest, "newest ghost is brighter than the oldest");
assert.ok(oldest >= 0.14 && newest <= 0.92);

assert.strictEqual(Trace.relativeTime(now, now), "just now");
assert.strictEqual(Trace.relativeTime(now - 15000, now), "15s ago");
assert.strictEqual(Trace.wrapIndex(0, 8, -1), 7);
assert.strictEqual(Trace.wrapIndex(7, 8, 1), 0);

const ws = Trace.visitFromWorkspace({
  id: 4,
  name: "code",
  toplevels: {
    values: [
      { title: "nvim", class: "Alacritty" },
      { title: "", class: "" },
      { title: "README", appId: "code" }
    ]
  }
}, now);
assert.strictEqual(ws.id, "ws:4");
assert.strictEqual(ws.label, "code");
assert.strictEqual(ws.source, "hyprland");
assert.strictEqual(ws.windows.length, 2);
assert.strictEqual(ws.windows[0].title, "nvim");
assert.strictEqual(Trace.jumpSpec(ws).kind, "hyprland");
assert.strictEqual(
  Trace.jumpSpec(ws).dispatch,
  'hl.dsp.focus({ workspace = "4" })'
);
assert.strictEqual(
  Trace.jumpSpec(ws).argv.join(" "),
  'hyprctl dispatch hl.dsp.focus({ workspace = "4" })'
);

assert.strictEqual(Trace.visitFromWorkspace(null), null);
assert.strictEqual(Trace.agentFootprints({}).length, 0, "missing Hermes stays missing");

const detected = Trace.agentFootprints({ hermesHome: true, now: now });
assert.strictEqual(detected.length, 1);
assert.strictEqual(detected[0].presence, "detected");
assert.strictEqual(Trace.presenceLabel(detected[0]), "DETECTED");
assert.ok(Trace.neverInventedAgentStatus(detected[0]));
assert.strictEqual(Trace.jumpSpec(detected[0]).kind, "noop");
assert.ok(detected[0].detail.indexOf("no session status") !== -1);

const rows = Trace.decorateTrail(demo, now, 0);
assert.strictEqual(rows.length, demo.length);
assert.strictEqual(rows[0].selected, true);
assert.ok(rows[0].opacity > rows[rows.length - 1].opacity);
assert.ok(rows.every(function(row) {
  return typeof row.trailX === "number"
    && typeof row.railY === "number"
    && row.chip === "DEMO";
}));

assert.ok(Trace.catalogHint("demo", 0).indexOf("demo trail") !== -1);
assert.ok(Trace.catalogHint("live", 1).indexOf("detected") !== -1);
assert.ok(!src.includes("pgrep"));
assert.ok(!src.includes("recently_active"));

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
assert.strictEqual(manifest.id, "smf.ghost-trace");
assert.ok(!String(manifest.id).startsWith("omarchy."));
assert.deepStrictEqual(manifest.kinds, ["overlay", "bar-widget"]);
assert.strictEqual(manifest.entryPoints.overlay, "Overlay.qml");
assert.strictEqual(manifest.entryPoints.barWidget, "BarWidget.qml");
assert.strictEqual(manifest.keepLoaded, true);
assert.ok(!fs.lstatSync(path.join(__dirname, "..", "Overlay.qml")).isSymbolicLink());
assert.ok(!fs.lstatSync(path.join(__dirname, "..", "BarWidget.qml")).isSymbolicLink());
assert.ok(!fs.lstatSync(path.join(__dirname, "..", "GhostCard.qml")).isSymbolicLink());
assert.ok(!fs.lstatSync(path.join(__dirname, "..", "TraceLogic.js")).isSymbolicLink());

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
assert.ok(readme.includes("omarchy plugin add https://github.com/smfworks/omarchy-ghost-trace.git --enable"));
assert.ok(readme.includes("omarchy-shell shell summon smf.ghost-trace '{}'"));
assert.ok(readme.includes("unsandboxed"));
assert.ok(readme.includes("DEMO"));
assert.ok(readme.includes("LIVE"));
assert.ok(readme.includes("Neural Pulse"));
assert.ok(readme.includes("Cron Constellation"));
assert.ok(readme.includes("Orbit Dock"));

console.log("ok - TraceLogic helpers");
