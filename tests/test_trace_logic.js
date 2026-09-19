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

function neverEmpty(state, label) {
  const ghosts = Trace.effectiveGhosts(state, now);
  assert.ok(ghosts.length > 0, label + " never paints an empty trail");
  return ghosts;
}

Trace.resetSharedState();

const demo = Trace.demoTrail(now);
assert.ok(demo.length >= 6 && demo.length <= 12, "demo trail is 6–12 ghosts");
demo.forEach(function(ghost) {
  assert.strictEqual(ghost.source, "demo");
  assert.strictEqual(ghost.presence, "demo");
  assert.strictEqual(ghost.workspaceId, "", "DEMO ghosts carry no jump token");
  assert.strictEqual(Trace.presenceLabel(ghost), "DEMO");
  assert.strictEqual(Trace.ghostChip(ghost, "demo"), "DEMO");
  assert.strictEqual(Trace.jumpSpec(ghost, "demo").kind, "demo");
  assert.strictEqual(Trace.jumpSpec(ghost, "live").kind, "demo");
  assert.strictEqual(Trace.jumpSpec(ghost).kind, "demo");
  assert.strictEqual(Trace.jumpSpec(ghost, "demo").argv.length, 0);
  assert.strictEqual(Trace.canJump(ghost, "live"), false);
});

const empty = Trace.emptyState();
assert.strictEqual(Trace.trailMode(empty), "demo");
assert.strictEqual(Trace.trailLabel("demo"), "DEMO");
assert.strictEqual(Trace.trailLabel("live"), "LIVE");
assert.strictEqual(Trace.trailLabel("stale"), "STALE");
assert.strictEqual(Trace.trailLabel("err"), "ERR");
assert.strictEqual(Trace.trailLabel(""), "DEMO", "unknown mode is DEMO, never unlabeled");
assert.strictEqual(Trace.trailLabel(undefined), "DEMO");
assert.ok(Trace.statusLine(empty).indexOf("DEMO") !== -1);
assert.strictEqual(Trace.effectiveGhosts(empty, now).length, demo.length);
neverEmpty(empty, "empty state");

let ring = [];
ring = Trace.pushVisit(ring, visit(3, now), 8);
ring = Trace.pushVisit(ring, visit(3, now + 50), 8);
assert.strictEqual(ring.length, 1, "consecutive same workspace is deduped");
assert.strictEqual(ring[0].visitedAt, now + 50);
assert.strictEqual(ring[0].source, "hyprland");

ring = Trace.pushVisit(ring, visit(1, now + 100), 8);
ring = Trace.pushVisit(ring, visit(7, now + 200), 8);
ring = Trace.pushVisit(ring, visit(1, now + 300), 8);
assert.strictEqual(ring.length, 4, "non-consecutive revisits stay in the ring");
assert.strictEqual(ring[0].workspaceId, 1);
assert.strictEqual(ring[1].workspaceId, 7);

const demoThenLive = Trace.pushVisit(
  [Trace.demoGhost(3, "3", "Editor", "editor", 0, now)],
  visit(3, now + 10),
  8
);
assert.strictEqual(demoThenLive.length, 2, "demo:3 and ws:3 do not merge");
assert.strictEqual(demoThenLive[0].source, "hyprland");
assert.strictEqual(demoThenLive[1].source, "demo");
assert.strictEqual(Trace.sameVisit(demoThenLive[0], demoThenLive[1]), false);

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
assert.ok(Trace.isLiveVisit(ring[0]));
neverEmpty(liveState, "live");

const staleState = {
  hyprlandReady: false,
  error: "Hyprland IPC failed",
  ring: ring,
  forceDemo: false
};
assert.strictEqual(Trace.trailMode(staleState), "stale");
assert.strictEqual(Trace.trailLabel("stale"), "STALE");
assert.strictEqual(Trace.effectiveGhosts(staleState, now)[0].source, "hyprland");
neverEmpty(staleState, "stale");

const silentReadyFalse = {
  hyprlandReady: false,
  error: "",
  ring: ring,
  forceDemo: false
};
assert.strictEqual(
  Trace.trailMode(silentReadyFalse),
  "stale",
  "live ring + not ready is STALE, not silent DEMO"
);
assert.ok(Trace.statusLine(silentReadyFalse).indexOf("STALE") !== -1);
assert.strictEqual(Trace.effectiveGhosts(silentReadyFalse, now)[0].source, "hyprland");

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
neverEmpty(errState, "err");

const emptyLiveLie = {
  hyprlandReady: true,
  error: "",
  ring: [],
  forceDemo: false
};
assert.strictEqual(Trace.trailMode(emptyLiveLie), "demo");
neverEmpty(emptyLiveLie, "ready-but-empty");

const forced = { hyprlandReady: true, error: "", ring: ring, forceDemo: true };
assert.strictEqual(Trace.trailMode(forced), "demo");
assert.strictEqual(Trace.parsePayload('{"demo":true}').forceDemo, true);
assert.strictEqual(Trace.parsePayload("not-json").forceDemo, false);
neverEmpty(forced, "force-demo");

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
assert.strictEqual(Trace.jumpSpec(ws, "live").kind, "hyprland");
assert.strictEqual(Trace.canJump(ws, "live"), true);
assert.strictEqual(
  Trace.jumpSpec(ws, "live").dispatch,
  'hl.dsp.focus({ workspace = "4" })'
);
assert.strictEqual(
  Trace.jumpSpec(ws, "live").argv.join(" "),
  'hyprctl dispatch hl.dsp.focus({ workspace = "4" })'
);
assert.strictEqual(Trace.jumpSpec(ws, "demo").kind, "demo");
assert.strictEqual(Trace.jumpSpec(ws, "err").kind, "demo");
assert.strictEqual(Trace.jumpSpec(ws, "stale").kind, "noop");
assert.strictEqual(Trace.jumpSpec(ws, "stale").argv.length, 0);
assert.strictEqual(Trace.canJump(ws, "stale"), false);
assert.strictEqual(Trace.canJump(ws, "demo"), false);
assert.strictEqual(Trace.workspaceFocusToken({ workspaceId: "4; pwn" }), "");
assert.strictEqual(Trace.workspaceFocusToken({ workspaceId: "" }), "");

assert.strictEqual(Trace.visitFromWorkspace(null), null);
assert.strictEqual(Trace.agentFootprints({}).length, 0, "missing Hermes stays missing");
assert.strictEqual(
  Trace.agentFootprints({ hermesBin: true, now: now }).length,
  0,
  "PATH hermes is not DETECTED"
);

const detected = Trace.agentFootprints({ hermesHome: true, now: now });
assert.strictEqual(detected.length, 1);
assert.strictEqual(detected[0].presence, "detected");
assert.strictEqual(Trace.presenceLabel(detected[0]), "DETECTED");
assert.strictEqual(Trace.ghostChip(detected[0], "live"), "DETECTED");
assert.ok(Trace.neverInventedAgentStatus(detected[0]));
assert.strictEqual(Trace.jumpSpec(detected[0], "live").kind, "noop");
assert.ok(detected[0].detail.indexOf("no session status") !== -1);
assert.ok(!/LIVE|BUSY|RUNNING/.test(detected[0].detail));

const demoRows = Trace.decorateTrail(demo, now, 0, "demo");
assert.strictEqual(demoRows.length, demo.length);
assert.strictEqual(demoRows[0].selected, true);
assert.ok(demoRows[0].opacity > demoRows[demoRows.length - 1].opacity);
assert.ok(demoRows.every(function(row) {
  return typeof row.trailX === "number"
    && typeof row.railY === "number"
    && row.chip === "DEMO";
}));

const staleRows = Trace.decorateTrail(ring, now, 0, "stale");
assert.ok(staleRows.every(function(row) { return row.chip === "STALE"; }));
const liveRows = Trace.decorateTrail(ring, now, 0, "live");
assert.ok(liveRows.every(function(row) { return row.chip === "LIVE"; }));
const errRows = Trace.decorateTrail(demo, now, 0, "err");
assert.ok(errRows.every(function(row) { return row.chip === "DEMO"; }));

assert.ok(Trace.catalogHint("demo", 0).indexOf("demo trail") !== -1);
assert.ok(Trace.catalogHint("live", 1).indexOf("detected") !== -1);
assert.ok(Trace.catalogHint("stale", 0).indexOf("stale") !== -1);
assert.ok(Trace.catalogHint("err", 0).indexOf("error") !== -1);
assert.ok(!src.includes("pgrep"));
assert.ok(!src.includes("command -v hermes"));
assert.ok(!src.includes("recently_active"));

Trace.resetSharedState();
assert.strictEqual(Trace.trailMode(Trace.readState()), "demo");
assert.strictEqual(Trace.ingestFromHyprland(null, now), false);
assert.ok(Trace.readState().error);
assert.strictEqual(Trace.trailMode(Trace.readState()), "err");
neverEmpty(Trace.readState(), "shared err");

assert.strictEqual(Trace.ingestFromHyprland({ focusedWorkspace: null }, now), false);
assert.ok(Trace.readState().error.indexOf("focused workspace") !== -1);

assert.strictEqual(
  Trace.ingestFromHyprland({
    get focusedWorkspace() { throw new Error("ipc"); }
  }, now),
  false
);
assert.ok(Trace.readState().error);

Trace.resetSharedState();
assert.ok(Trace.ingestFromHyprland({
  focusedWorkspace: { id: 2, name: "2" }
}, now));
const sharedLive = Trace.readState();
assert.strictEqual(Trace.trailMode(sharedLive), "live");
assert.strictEqual(sharedLive.ring[0].workspaceId, 2);
assert.strictEqual(sharedLive.error, "");

assert.ok(Trace.ingestFromHyprland({
  focusedWorkspace: { id: 2, name: "2" }
}, now + 20));
assert.strictEqual(Trace.readState().ring.length, 1, "shared consecutive ingest dedupes");

assert.ok(Trace.ingestFromHyprland({
  focusedWorkspace: { id: 5, name: "code" }
}, now + 40));
assert.strictEqual(Trace.readState().ring.length, 2);
assert.strictEqual(Trace.readState().ring[0].workspaceId, 5);

Trace.markHyprlandError("Hyprland IPC failed");
assert.strictEqual(Trace.trailMode(Trace.readState()), "stale");
assert.strictEqual(Trace.effectiveGhosts(Trace.readState(), now)[0].source, "hyprland");

Trace.writeForceDemo(true);
assert.strictEqual(Trace.trailMode(Trace.readState()), "demo");
assert.strictEqual(Trace.canJump(Trace.readState().ring[0], Trace.trailMode(Trace.readState())), false);

Trace.writeForceDemo(false);
Trace.writeHermesFlags({ hermesHome: true, hermesBin: true });
const sharedFlags = Trace.readState();
assert.strictEqual(sharedFlags.hermesHome, true);
assert.strictEqual(Trace.agentFootprints(sharedFlags).length, 1);

Trace.writeHermesFlags({ hermesHome: false, hermesBin: true });
assert.strictEqual(Trace.agentFootprints(Trace.readState()).length, 0);

const overlayQml = fs.readFileSync(path.join(__dirname, "..", "Overlay.qml"), "utf8");
const barQml = fs.readFileSync(path.join(__dirname, "..", "BarWidget.qml"), "utf8");
const cardQml = fs.readFileSync(path.join(__dirname, "..", "GhostCard.qml"), "utf8");
assert.ok(overlayQml.includes("Trace.jumpSpec(ghost, root.mode)"));
assert.ok(overlayQml.includes("Trace.ingestFromHyprland"));
assert.ok(overlayQml.includes("modelData.chip"));
assert.ok(!overlayQml.includes("command -v hermes"));
assert.ok(!overlayQml.includes("Hermes") || overlayQml.includes("Trace.presenceLabel"));
assert.ok(!/String\(modelData\.label \|\| "Hermes"\) \+ " · DETECTED"/.test(overlayQml));
assert.ok(barQml.includes("Trace.trailLabel"));
assert.ok(barQml.includes("root.modeLabel"));
assert.ok(barQml.includes("Trace.readState"));
assert.ok(cardQml.includes("DEMO"));

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
assert.strictEqual(manifest.id, "smf.ghost-trace");
assert.ok(!String(manifest.id).startsWith("omarchy."));
assert.deepStrictEqual(manifest.kinds, ["overlay", "bar-widget"]);
assert.strictEqual(manifest.entryPoints.overlay, "Overlay.qml");
assert.strictEqual(manifest.entryPoints.barWidget, "BarWidget.qml");
assert.strictEqual(manifest.keepLoaded, true);

function refuteSymlink(rel) {
  const full = path.join(__dirname, "..", rel);
  assert.ok(!fs.lstatSync(full).isSymbolicLink(), rel + " must not be a symlink");
}
["Overlay.qml", "BarWidget.qml", "GhostCard.qml", "TraceLogic.js", "docs/OPPOSITION.md"].forEach(refuteSymlink);

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
assert.ok(readme.includes("omarchy plugin add https://github.com/smfworks/omarchy-ghost-trace.git --enable"));
assert.ok(readme.includes("omarchy-shell shell summon smf.ghost-trace '{}'"));
assert.ok(readme.includes("unsandboxed"));
assert.ok(readme.includes("DEMO"));
assert.ok(readme.includes("LIVE"));
assert.ok(readme.includes("STALE"));
assert.ok(readme.includes("ERR"));
assert.ok(readme.includes("only while LIVE") || readme.includes("only when LIVE"));
assert.ok(readme.includes("docs/OPPOSITION.md"));
assert.ok(readme.includes("Neural Pulse"));
assert.ok(readme.includes("Cron Constellation"));
assert.ok(readme.includes("Orbit Dock"));

const opposition = fs.readFileSync(path.join(__dirname, "..", "docs/OPPOSITION.md"), "utf8");
assert.ok(opposition.includes("## 2. P0"));
assert.ok(opposition.includes("## 3. P1"));
assert.ok(opposition.includes("## 4. P2"));
assert.ok(opposition.includes("## 5. Quick wins"));
assert.ok(opposition.includes("False workspace history"));
assert.ok(opposition.includes("DEMO looks like LIVE"));
assert.ok(opposition.includes("Silent Hyprland IPC"));
assert.ok(opposition.includes("Jump-to-workspace"));
assert.ok(opposition.includes("Hermes DETECTED"));
assert.ok(opposition.includes("Bar chip vs overlay"));

console.log("ok - TraceLogic helpers");
