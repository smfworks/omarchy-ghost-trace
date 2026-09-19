# Opposition: do not trust the afterimage trail yet

Adversarial review of `smfworks/omarchy-ghost-trace` at `4a7e353`
(`smf.ghost-trace` v0.1.0, plugin #1). Evidence is from `TraceLogic.js`,
`Overlay.qml`, `BarWidget.qml`, `GhostCard.qml`, `manifest.json`,
`README.md`, and `tests/test_trace_logic.js` **as they shipped on `main`**.

## Addressed in honest-trail

The follow-up product PR (`Honest trail — OPPOSITION + trust fixes`) changes
the trust contract this review asked for. The analysis below is the **pre-fix
evidence**. What that PR closes is listed in §6; leftover P1/P2 items stay
open.

Method: assume a user screenshots the overlay (or the bar chip) and believes
the glowing rectangles are the workspaces they just left. Argue against that
trust. Example inputs are concrete.

---

## 1. Executive opposition

Ghost Trace sells a sci-fi afterimage of “recently visited Hyprland
workspaces.” What it actually paints is an **in-memory poll ring** that
starts empty when the keepLoaded overlay mounts, plus a curated DEMO trail
that uses **real-looking workspace numbers and window titles**. The honesty
chip on the overlay can say DEMO while every silhouette still reads like a
live desktop (Editor / nvim / WS 3). The bar chip says nothing at all.

Hyprland IPC failure is not always an error. `ingestFocused()` can set
`hyprlandReady = false` and leave `errorText` blank, which drops
`trailMode` to `"demo"` even when a live ring already exists — the last
real visits vanish and the DEMO set appears with no STALE / ERR glyph.
Enter/click still builds a Hyprland dispatch from `ghost.workspaceId`.
DEMO ghosts ship `workspaceId: 3` / `1` / `7`. One missed `source ===
"demo"` check and the HUD jumps the **real** workspace that happens to
share that number.

Hermes is “DETECTED” from `command -v hermes` or any readable
`~/.hermes/state.db`. That is not a session. The bar never shares the
overlay’s ring, so a screenshot of `GT` and a screenshot of `LIVE` can
disagree. Until chips, jump, IPC failure, and the ring cannot lie, this
is a mood light, not a trail.

---

## 2. P0 — trust breakers (must-fix)

### P0.1 False workspace history

The README: “last 6–12 workspace visits.” The ring is not Hyprland’s
history. It is `pushVisit` of `Hyprland.focusedWorkspace` on a 2s timer
plus `onFocusedWorkspaceChanged`, **only while this plugin stays
loaded**.

```javascript
// TraceLogic.js visitFromWorkspace / Overlay.qml ingestFocused
root.ring = Trace.pushVisit(root.ring, visit, Trace.RING_CAP)
```

| Input | What the ring stores | What the screenshot implies |
| --- | --- | --- |
| Shell just started, user has been on WS 2 → 5 → 8 all morning | One visit: whatever is focused at first ingest | A real session trail |
| Overlay not keepLoaded yet / plugin disabled during the morning | Empty ring → DEMO trail of Editor, Terminal, Browser, Files, Chat, Music, Notes | Those seven were visited |
| Stay on WS 3 for ten minutes | `mergeVisit` rewrites `visitedAt` every 2s | “just now”, not a 10-minute dwell |
| DEMO payload or first summon before a switch | `demoTrail()` with `workspaceId` 3, 1, 7, 2, 5, 9, 4 and titles like `nvim · ghost-trace` | A coding session that never happened |

`sameVisit` then treats **any** matching `workspaceId` as the same visit,
including a DEMO ghost and a later Hyprland visit that share `3`:

```javascript
if (String(left.id || "") && String(left.id) === String(right.id))
  return true
return String(left.workspaceId) !== ""
  && String(left.workspaceId) === String(right.workspaceId)
```

`id`s differ (`demo:3` vs `ws:3`) so the function falls through to
`workspaceId` and **merges demo into live**. The ring can carry demo
windows labeled `source: "hyprland"` after one poll.

`hasLiveVisits` only checks `source === "hyprland"`. A contaminated row
flips the HUD to LIVE.

This is not a visit ledger. It is a focus poll with a costume.

### P0.2 DEMO looks like LIVE

The overlay has an honesty chip. The ghosts do not use it.

- Large silhouettes render `modelData.label` (“Editor”) and fake window
  panes. No DEMO / LIVE / STALE / ERR badge on the rectangle itself.
- `GhostCard` shows `workspaceId` as a big accent numeral. DEMO ghosts
  use `3`, `1`, `7` — the same tokens Hyprland uses.
- `decorateTrail` sets `chip` from `presenceLabel(g)` only. In **STALE**
  mode the honesty bar says STALE while every card still chips **LIVE**
  because `presence` stayed `"live"`.
- `presenceLabel` returns `""` for unknown presence. An unlabeled card
  looks like an unmarked live instrument (Neural Pulse’s exact bar-face
  failure).
- `trailLabel` falls through to `String(mode || "").toUpperCase()`.
  Empty / unexpected mode paints **no chip**.

`BarWidget.qml` is worse: the face is decorative `GT` rectangles and
tooltip “Ghost Trace — workspace afterimages”. No DEMO / LIVE / STALE /
ERR. A bar screenshot is indistinguishable from a working install.

Force-demo (`{"demo":true}`) still paints the same neon trail. The chip
says DEMO; the desktop still looks visited.

### P0.3 Silent Hyprland IPC failure (and silent empty)

`ingestFocused()`:

```qml
var ws = Hyprland.focusedWorkspace
if (root.ingestWorkspace(ws)) return
root.hyprlandReady = false
```

No `setHyprlandError`. `errorText` stays `""`.

`trailMode`:

```javascript
if (state.forceDemo === true) return "demo"
if (state.error && hasLiveVisits(state.ring)) return "stale"
if (state.error) return "err"
if (state.hyprlandReady === true && hasLiveVisits(state.ring)) return "live"
return "demo"
```

| Input | State | Face |
| --- | --- | --- |
| `Hyprland` defined, `focusedWorkspace` null / id-less | `ready=false`, `error=""`, live ring still in memory | **DEMO trail replaces the live ring.** No STALE. |
| `focusedWorkspace` getter throws in the property binding | Binding returns `null`; ingest path above | Same silent DEMO |
| IPC failed, `error` set, ring empty | `err` | Status says ERR, `effectiveGhosts` paints DEMO (good) — **unless** someone later clears `error` without a visit |
| Live mode, `ring: []` (mode should be impossible, but `effectiveGhosts` does not guard) | `live` | **Empty desktop.** README: “The HUD never fails empty.” The function does. |

`typeof Hyprland === "undefined"` and the `catch` do set an error. The
common “object exists, snapshot missing” path does not. That is the
silent failure.

### P0.4 Jump-to-workspace hits the wrong target

`jumpSpec` builds a real Omarchy / Hyprland helper from whatever
`workspaceId` is on the ghost:

```javascript
var dispatch = "hl.dsp.focus({ workspace = \"" + String(id) + "\" })"
argv: ["hyprctl", "dispatch", dispatch]
```

That **is** the string `omarchy.workspaces` `Workspaces.qml` uses
(`Hyprland.dispatch("hl.dsp.focus({ workspace = \"" + id + "\" })")`,
and the older `bar.run("hyprctl dispatch …")` path). The helper is not
the bug. **When** it is called is the bug.

| Input | `jumpSpec` | What happens |
| --- | --- | --- |
| DEMO ghost (`workspaceId: 3`, `source: "demo"`) | `kind: "demo"`, empty argv | Overlay still sets `jumping = true` and pulses the silhouette as if a jump ran |
| DEMO ghost if `source` / `presence` stripped | `kind: "hyprland"`, dispatch workspace **3** | Real WS 3 focused. The card said “Editor” |
| STALE / ERR overlay, leftover live ghost | `kind: "hyprland"` — **mode is not an argument** | Dispatch while IPC is the thing that just failed, or while the HUD is advertising DEMO |
| Agent row | `noop` | Fine |
| `activateIndex` after a no-op dispatch that does not throw | `jumped === true`, overlay dismisses | User is left on the wrong workspace with the HUD gone |

`Overlay.qml` `jumpWorkspace` does not read `root.mode`. Fallback
`Quickshell.execDetached(spec.argv)` runs the same Lua string through
`hyprctl` even when the honesty chip is DEMO, if `jumpSpec` ever
returns `hyprland`.

Wrong target is not “Lua vs `workspace N`”. Wrong target is **dispatching
a real helper for a ghost that is not a LIVE Hyprland visit**.

### P0.5 Hermes DETECTED lies

```qml
FileView {
  path: Quickshell.env("HOME") + "/.hermes/state.db"
  onLoaded: root.hermesHome = true
}
Process {
  command: ["bash", "-c", "command -v hermes >/dev/null"]
  onExited: root.hermesBin = hermesBinProc.exitCode === 0
}
```

`agentFootprints` ORs those flags. Overlay rail then hardcodes the
caption:

```qml
text: String(modelData.label || "Hermes") + " · DETECTED"
```

Neural Pulse already burned this: `pgrep -x hermes` / any `hermes` on
`PATH` is not agent activity. Here `command -v hermes` lights DETECTED
for a leftover CLI, an installer, or an unrelated binary. `FileView`
`onLoaded` fires for any readable file — empty leftover `state.db`,
someone else’s symlink, a zero-byte touch.

What DETECTED does **not** mean: a live session, a title, a cost, a
workspace the agent is on. `neverInventedAgentStatus` only blocks the
strings `LIVE` / `BUSY` / `RUNNING`. The rail still says DETECTED as if
Hermes were present-and-working.

### P0.6 Bar chip vs overlay state drift

Two plugin kinds, two roots, **no shared trail state**.

- Overlay: keepLoaded `Item` with `ring`, `errorText`, `hyprlandReady`,
  `forceDemo`. Honesty chip from `Trace.trailMode`.
- Bar: `BarWidget` that never imports `TraceLogic.js` or
  `Quickshell.Hyprland`. Face is always `GT`.

| Overlay | Bar screenshot |
| --- | --- |
| DEMO (first summon / `{"demo":true}`) | Unlabeled ghosts — reads installed |
| STALE (IPC died, ring kept) | Same unlabeled `GT` |
| ERR | Same |
| LIVE after a morning of switches | Same |

Neural Pulse Honest-pulse rule: the bar face must name its mode.
Ghost Trace’s bar is a summoner sticker. The overlay can be ERR while
the chip the user actually looks at all day stays mute.

Even if the bar grew its own ring, two independent `pushVisit` loops
would drift (different start time, different missed polls). The
`.pragma library` is the shared singleton and today holds **no** trail
state.

---

## 3. P1 — gaps / correctness

- **Consecutive-dupe is only half-specified.** Tests require
  `pushVisit(ws3, ws3)` → length 1 and `visitedAt` = latest. That is
  last-seen, not first-visited. `sameVisit` ignores `source` /
  `presence` (P0.1). Non-consecutive revisits correctly stay as two
  rows; a DEMO/LIVE pair with the same number does not.
- **`effectiveGhosts` can return empty.** `live` / `stale` return
  `state.ring` as-is. README and `statusLine("ERR")` promise the HUD
  never fails empty. An empty live ring (or a test/state corruption)
  paints a blank field with a LIVE chip.
- **Window scrape is best-effort.** `collectWindows` walks
  `toplevels.values` / `toplevels` / `windows`. Quickshell builds that
  expose another collection leave live ghosts empty while DEMO ghosts
  show four fake panes. Live looks poorer than demo — and therefore
  less “real” — or the reverse if a stale scrape keeps dead titles.
- **Jump token is unvalidated.** `String(id)` is interpolated into Lua.
  A weird `workspace.name` used as id would break out of the
  `{ workspace = "…" }` quote. Pre-fix path uses numeric ids from
  Hyprland; still no allow-list.
- **Hermes binary probe is a permanent Process** on overlay complete.
  Same family as Neural Pulse’s always-on `pgrep`. Detection is not
  recency, not `state.db` schema, not `last_activity_at`.
- **QML / Omarchy contract leftovers** (same class as pre-fix Pulse):
  overlay `open` / `close` / `toggle` exist; bar does not forward
  `opened` / `closeForPopoutSwitch` because it only `exec`s
  `omarchy-shell shell toggle`. No `preview.png`. README says
  `omarchy plugin validate .` and not
  `qmllint -I "$OMARCHY_PATH/shell" Overlay.qml BarWidget.qml GhostCard.qml`.
- **Polling.** `POLL_MS = 2000` forever, overlay closed, plus
  `focusedWorkspace` bindings. Official clock uses `SystemClock`. This
  is a permanent ingest loop for a HUD that is usually hidden.
- **Security.** Plugins are unsandboxed in `omarchy-shell` (README says
  so). `FileView` follows `~/.hermes/state.db` if it is a symlink.
  `command -v hermes` is a shell. Workspace titles from live
  toplevels are screenshot-ready (the feature). DEMO titles invent a
  coding session that will be believed in a screenshot.
- **Tests the current file avoids.** `trailMode` when `ready=false`,
  `error=""`, live ring present (must not be DEMO). `jumpSpec` with
  mode `demo` / `stale` / `err`. `sameVisit` across `demo` vs
  `hyprland`. `effectiveGhosts` never empty. `trailLabel("")`.
  `agentFootprints({ hermesBin: true })` must stay empty. Bar/overlay
  shared state — no tests, because there is no shared state.
- **No CI workflow.** `node tests/test_trace_logic.js` is local only.

---

## 4. P2 — improvements

- Persist the ring across `omarchy-shell` restart (or read Hyprland’s
  own previous-workspace / workspace list) so “history” is not “since
  this plugin loaded.”
- Record `firstVisitedAt` and `lastSeenAt` separately. Age the
  afterimage from last-seen-when-left, not from “we polled again.”
- Verify `state.db` is actually a Hermes SQLite schema before
  DETECTED. Honor `HERMES_HOME` / named profiles; do not treat a
  leftover default file as the active agent.
- Stop the 2s ingest when the overlay is hidden and Hyprland is absent
  (probe once, back off).
- `preview.png`; `qmllint` in README; pin a tag instead of git HEAD;
  add a GitHub Actions workflow for `node tests/test_trace_logic.js`.
- Named / special workspaces: dispatch `name:` / `special:` tokens
  from `workspace.name` when id is a negative special id.
- Theme tokens only (already mostly `Color.accent`). Keep it that way.
- Do not grow a second Hermes session strip here. Neural Pulse owns
  sessions. This plugin should only say “home visible, no session
  status.”

---

## 5. Quick wins (≤ 1 day)

1. **Chips on every face, always.** Overlay honesty bar, each
   silhouette, each `GhostCard`, and the bar widget. Labels are
   `DEMO` / `LIVE` / `STALE` / `ERR`. Never unlabeled. STALE ghosts
   chip STALE, not LIVE. Unknown mode chips DEMO, not `""`.
2. **Never silent IPC, never empty HUD.** Null / id-less
   `focusedWorkspace` is an error. `!hyprlandReady` + live ring →
   STALE even if `error` was forgotten. `effectiveGhosts` falls back
   to `demoTrail` whenever the ring is empty.
3. **`sameVisit` requires the same `source`.** Consecutive Hyprland
   polls of WS 3 still collapse. `demo:3` and `ws:3` do not.
4. **`jumpSpec(ghost, mode)`.** `kind: "hyprland"` only when
   `mode === "live"` and the ghost is a live Hyprland visit. DEMO
   ghosts carry no jump token (`workspaceId` empty). Overlay does not
   pulse/dismiss on demo/noop.
5. **Hermes = readable `state.db` only.** Delete `command -v hermes`
   as a detection OR. Rail uses `presenceLabel`, never a hardcoded
   `DETECTED`. Still no session status / USD / title invention.
6. **Share trail state in `TraceLogic.js`.** Overlay and bar read the
   same ring / error / forceDemo. Bar paints the same chip the overlay
   would.
7. **README:** jump only while LIVE; bar chip; never-empty; link this
   file; `node tests/test_trace_logic.js`.
8. **Tests for (1)–(6).** Especially silent-ready-false, jump-by-mode,
   never-empty, demo/hyprland non-merge, hermesBin-only empty.

---

## 6. Suggested next ship (one concrete fix PR)

**Title:** Honest trail — OPPOSITION + trust fixes.

**Do not** restyle the hologram. Change the trust contract:

1. `trailMode` / `trailLabel` / `ghostChip`: DEMO, LIVE, STALE, ERR
   are exhaustive and visible on overlay, cards, silhouettes, and bar.
2. IPC miss is `error` + STALE (if a live ring exists) or ERR (if
   not). `effectiveGhosts` never returns `[]`.
3. Ring: source-aware consecutive dedupe; shared `.pragma library`
   state so the bar cannot drift from the overlay.
4. `jumpSpec(ghost, mode)` uses `hl.dsp.focus({ workspace = "N" })`
   **only** when LIVE. DEMO / STALE / ERR are demo/noop.
5. Hermes footprint only when `~/.hermes/state.db` loaded. Presence
   DETECTED. No PATH binary lie.
6. Tests + README for the contract above.

That single PR makes a screenshot of the trail *disprovable*. Visual
polish and persisted history can follow.

---

## 7. What already holds (do not redo)

- **DEMO / LIVE / STALE / ERR exist as functions.** `trailMode`,
  `trailLabel`, `statusLine`, `effectiveGhosts` were the right shape.
  The failure is the silent `ready=false` hole, blank `trailLabel`,
  STALE-cards-still-LIVE, empty-ring LIVE, and the bar having none of
  it.
- **DEMO ghosts are already tagged `source: "demo"` / `presence:
  "demo"`** and `jumpSpec` already no-ops when those fields survive.
  The failure is `workspaceId` still being a real number, mode not
  being passed, and Overlay pulsing anyway.
- **`neverInventedAgentStatus`** already refuses LIVE / BUSY /
  RUNNING on agent rows. Do not invent session status in the honesty
  PR either.
- **Consecutive same-workspace collapse and 6–12 cap** already have
  tests. Keep last-seen `visitedAt` on merge; just stop merging across
  sources.
- **Quattro overlay + bar-widget shape is largely correct:**
  `schemaVersion: 1`, id `smf.ghost-trace` (not `omarchy.*`),
  `kinds: ["overlay", "bar-widget"]`, `keepLoaded: true`,
  `open` / `close` / `toggle`, `qs.Ui` / `qs.Commons` /
  `Quickshell.Hyprland`, no repo symlinks. Matches Orbit Dock more
  closely than it misses.
- **USD / session titles are not invented** (this plugin does not
  render them). Keep it that way.
- **Unsandboxed warning** is already in the README.
- **Node helper tests exist** and already cover the happy path the
  first PR believed. They are not a screenshot-acceptance suite.

None of that makes an afterimage screenshot safe. It means the next PR
can stay small: honest chips, honest IPC, honest jump, shared bar
state, tests.
