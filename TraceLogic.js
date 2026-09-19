.pragma library

// Ghost Trace helpers. Workspace history is a shared in-memory ring while
// the keepLoaded overlay (and bar) stay mounted. DEMO / LIVE / STALE / ERR
// are exhaustive. Jump uses Hyprland helpers only while LIVE. Hermes
// footprints appear only when ~/.hermes/state.db is readable — never from
// PATH, never as invented session status.

var RING_CAP = 8
var MIN_RING = 6
var MAX_RING = 12
var MAX_AGE_MS = 12 * 60 * 1000
var MAX_WINDOWS = 4
var POLL_MS = 2000

var shared = emptyState()

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value))
}

function number(value) {
  var n = Number(value)
  return isFinite(n) ? n : 0
}

function clampCap(cap) {
  var n = Math.round(number(cap))
  if (n <= 0) return RING_CAP
  return clamp(n, MIN_RING, MAX_RING)
}

function emptyState() {
  return {
    hyprlandReady: false,
    error: "",
    ring: [],
    forceDemo: false,
    hermesHome: false,
    hermesBin: false
  }
}

function cloneWindows(windows) {
  var list = windows || []
  var out = []
  for (var i = 0; i < list.length && out.length < MAX_WINDOWS; i++) {
    var win = list[i] || {}
    out.push({
      title: String(win.title || ""),
      className: String(win.className || win.class || win.appId || "")
    })
  }
  return out
}

function cloneGhost(ghost) {
  if (!ghost || typeof ghost !== "object") return null
  return {
    kind: String(ghost.kind || "workspace"),
    id: String(ghost.id || ""),
    workspaceId: ghost.workspaceId === undefined || ghost.workspaceId === null
      ? ""
      : ghost.workspaceId,
    name: String(ghost.name || ""),
    label: String(ghost.label || ghost.name || ""),
    windows: cloneWindows(ghost.windows),
    visitedAt: number(ghost.visitedAt),
    source: String(ghost.source || ""),
    presence: String(ghost.presence || ""),
    detail: String(ghost.detail || "")
  }
}

function cloneRing(ring) {
  var list = ring || []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var item = cloneGhost(list[i])
    if (item) out.push(item)
  }
  return out
}

function readState() {
  return {
    hyprlandReady: shared.hyprlandReady === true,
    error: String(shared.error || ""),
    ring: cloneRing(shared.ring),
    forceDemo: shared.forceDemo === true,
    hermesHome: shared.hermesHome === true,
    hermesBin: shared.hermesBin === true
  }
}

function resetSharedState() {
  shared = emptyState()
  return readState()
}

function writeForceDemo(flag) {
  shared.forceDemo = flag === true
  return readState()
}

function writeHermesFlags(flags) {
  flags = flags || {}
  if (flags.hermesHome !== undefined) shared.hermesHome = flags.hermesHome === true
  if (flags.hermesBin !== undefined) shared.hermesBin = flags.hermesBin === true
  return readState()
}

function markHyprlandError(message) {
  shared.hyprlandReady = false
  shared.error = message || "Hyprland IPC failed"
  return readState()
}

function workspaceLabel(name, id) {
  var raw = String(name || "").trim()
  if (!raw || raw === String(id)) return "WS " + String(id)
  if (/^\d+$/.test(raw)) return "WS " + raw
  return raw
}

function windowFromToplevel(top) {
  if (!top) return null
  var title = String(top.title || "")
  var className = String(top.className || top.class || top.appId || top.wmClass || "")
  if (!title && !className) return null
  return { title: title, className: className }
}

function collectWindows(workspace) {
  var out = []
  if (!workspace) return out
  var tops = null
  try {
    if (workspace.toplevels && workspace.toplevels.values)
      tops = workspace.toplevels.values
    else if (workspace.toplevels)
      tops = workspace.toplevels
    else if (workspace.windows)
      tops = workspace.windows
  } catch (e) {
    tops = null
  }
  if (!tops) return out
  var n = tops.length !== undefined ? tops.length : 0
  for (var i = 0; i < n && out.length < MAX_WINDOWS; i++) {
    var win = windowFromToplevel(tops[i])
    if (win) out.push(win)
  }
  return out
}

function visitFromWorkspace(workspace, now) {
  if (!workspace) return null
  var id = workspace.id
  if (id === undefined || id === null || id === "") return null
  var name = String(workspace.name || id)
  return {
    kind: "workspace",
    id: "ws:" + String(id),
    workspaceId: id,
    name: name,
    label: workspaceLabel(name, id),
    windows: collectWindows(workspace),
    visitedAt: now || Date.now(),
    source: "hyprland",
    presence: "live",
    detail: ""
  }
}

function isLiveVisit(entry) {
  if (!entry) return false
  if (String(entry.kind || "workspace") === "agent") return false
  return String(entry.source || "") === "hyprland"
    && String(entry.presence || "") === "live"
}

function sameVisit(left, right) {
  if (!left || !right) return false
  if (String(left.kind || "workspace") !== String(right.kind || "workspace"))
    return false
  if (String(left.source || "") !== String(right.source || ""))
    return false
  if (String(left.id || "") && String(left.id) === String(right.id))
    return true
  return String(left.workspaceId) !== ""
    && String(left.workspaceId) === String(right.workspaceId)
}

function mergeVisit(previous, next) {
  var copy = cloneGhost(previous) || cloneGhost(next)
  if (!copy) return null
  if (next) {
    copy.visitedAt = number(next.visitedAt) || copy.visitedAt
    if (next.windows && next.windows.length) copy.windows = cloneWindows(next.windows)
    if (next.name) copy.name = String(next.name)
    if (next.label) copy.label = String(next.label)
    if (next.source) copy.source = String(next.source)
    if (next.presence) copy.presence = String(next.presence)
  }
  return copy
}

function pushVisit(ring, visit, cap) {
  var next = cloneRing(ring)
  var incoming = cloneGhost(visit)
  if (!incoming || !incoming.id) return next
  if (next.length && sameVisit(next[0], incoming)) {
    next[0] = mergeVisit(next[0], incoming)
    return next
  }
  next = [incoming].concat(next)
  var limit = clampCap(cap)
  while (next.length > limit) next.pop()
  return next
}

function hasLiveVisits(ring) {
  var list = ring || []
  for (var i = 0; i < list.length; i++) {
    if (isLiveVisit(list[i])) return true
  }
  return false
}

function applyVisit(workspace, now) {
  var visit = visitFromWorkspace(workspace, now)
  if (!visit) {
    markHyprlandError("Hyprland workspace snapshot invalid")
    return false
  }
  shared.hyprlandReady = true
  shared.error = ""
  shared.ring = pushVisit(shared.ring, visit, RING_CAP)
  return true
}

function ingestFromHyprland(hyprland, now) {
  if (!hyprland) {
    markHyprlandError("Hyprland IPC unavailable")
    return false
  }
  var ws = null
  try {
    ws = hyprland.focusedWorkspace
  } catch (e) {
    markHyprlandError("Hyprland IPC failed")
    return false
  }
  if (!ws) {
    markHyprlandError("Hyprland focused workspace unavailable")
    return false
  }
  return applyVisit(ws, now)
}

function demoWindows(kind) {
  if (kind === "editor")
    return [
      { title: "nvim · ghost-trace", className: "Alacritty" },
      { title: "README.md", className: "code" }
    ]
  if (kind === "browser")
    return [{ title: "Omarchy Plugins", className: "firefox" }]
  if (kind === "term")
    return [{ title: "journalctl -f", className: "Alacritty" }]
  if (kind === "files")
    return [{ title: "~/src", className: "org.gnome.Nautilus" }]
  if (kind === "chat")
    return [{ title: "signal", className: "Signal" }]
  if (kind === "music")
    return [{ title: "queue", className: "spotify" }]
  return [{ title: "notes", className: "org.gnome.TextEditor" }]
}

function demoGhost(id, name, label, kind, ageMs, now) {
  return {
    kind: "workspace",
    id: "demo:" + id,
    workspaceId: "",
    name: String(name),
    label: String(label),
    windows: demoWindows(kind),
    visitedAt: (now || Date.now()) - ageMs,
    source: "demo",
    presence: "demo",
    detail: ""
  }
}

function demoTrail(now) {
  var t = now || Date.now()
  return [
    demoGhost(3, "3", "Editor", "editor", 4000, t),
    demoGhost(1, "1", "Terminal", "term", 18000, t),
    demoGhost(7, "7", "Browser", "browser", 42000, t),
    demoGhost(2, "2", "Files", "files", 78000, t),
    demoGhost(5, "5", "Chat", "chat", 140000, t),
    demoGhost(9, "9", "Music", "music", 240000, t),
    demoGhost(4, "4", "Notes", "notes", 360000, t)
  ]
}

function agentFootprints(flags) {
  flags = flags || {}
  var out = []
  if (flags.hermesHome === true) {
    out.push({
      kind: "agent",
      id: "agent:hermes",
      workspaceId: "",
      name: "Hermes",
      label: "Hermes home",
      windows: [],
      visitedAt: number(flags.now) || Date.now(),
      source: "detected",
      presence: "detected",
      detail: "state.db present — no session status"
    })
  }
  return out
}

function presenceLabel(entry) {
  var value = String((entry && entry.presence) || "")
  if (value === "demo") return "DEMO"
  if (value === "detected") return "DETECTED"
  if (value === "live") return "LIVE"
  if (value === "stale") return "STALE"
  if (value === "err") return "ERR"
  return ""
}

function ghostChip(ghost, mode) {
  if (!ghost) return "DEMO"
  if (String(ghost.kind || "") === "agent") return "DETECTED"
  var resolved = String(mode || trailMode(emptyState()))
  if (resolved === "stale") return "STALE"
  if (resolved === "live") return isLiveVisit(ghost) ? "LIVE" : "DEMO"
  if (resolved === "err") return "DEMO"
  return "DEMO"
}

function neverInventedAgentStatus(entry) {
  if (!entry || entry.kind !== "agent") return true
  var presence = String(entry.presence || "")
  if (presence !== "detected") return false
  var label = presenceLabel(entry)
  return label !== "LIVE" && label !== "BUSY" && label !== "RUNNING"
}

function trailMode(state) {
  state = state || emptyState()
  if (state.forceDemo === true) return "demo"
  var live = hasLiveVisits(state.ring)
  if (live && (state.error || state.hyprlandReady !== true)) return "stale"
  if (state.error) return "err"
  if (state.hyprlandReady === true && live) return "live"
  return "demo"
}

function trailLabel(mode) {
  if (mode === "err") return "ERR"
  if (mode === "stale") return "STALE"
  if (mode === "demo") return "DEMO"
  if (mode === "live") return "LIVE"
  return "DEMO"
}

function statusLine(state) {
  var mode = trailMode(state)
  if (mode === "stale")
    return "STALE · last Hyprland snapshot · IPC failed"
  if (mode === "err")
    return "ERR · Hyprland IPC failed · showing DEMO trail"
  if (mode === "demo")
    return "DEMO trail · Hyprland history not connected"
  var n = ((state && state.ring) || []).length
  return "LIVE · " + n + " workspace visit" + (n === 1 ? "" : "s")
}

function effectiveGhosts(state, now) {
  state = state || emptyState()
  var mode = trailMode(state)
  if (mode === "live" || mode === "stale") {
    var ring = cloneRing(state.ring)
    if (ring.length > 0) return ring
  }
  return demoTrail(now)
}

function ageOpacity(visitedAt, now, index, count) {
  var age = Math.max(0, number(now) - number(visitedAt))
  var ageFade = clamp(1 - age / MAX_AGE_MS, 0.16, 1)
  var span = Math.max(1, number(count) - 1)
  var indexFade = 1 - (number(index) / span) * 0.58
  return clamp(ageFade * indexFade, 0.14, 0.92)
}

function relativeTime(epochMs, nowMs) {
  var ts = number(epochMs)
  if (ts <= 0) return ""
  var now = number(nowMs) || Date.now()
  var delta = Math.max(0, now - ts)
  if (delta < 2000) return "just now"
  if (delta < 60000) return Math.floor(delta / 1000) + "s ago"
  if (delta < 3600000) return Math.floor(delta / 60000) + "m ago"
  return Math.floor(delta / 3600000) + "h ago"
}

function wrapIndex(index, count, delta) {
  var n = count | 0
  if (n <= 0) return 0
  var i = index | 0
  var d = delta | 0
  return ((i + d) % n + n) % n
}

function decorateTrail(ghosts, now, selectedIndex, mode) {
  var list = ghosts || []
  var resolved = String(mode || "")
  var out = []
  for (var i = 0; i < list.length; i++) {
    var g = cloneGhost(list[i])
    if (!g) continue
    g.ageMs = Math.max(0, number(now) - number(g.visitedAt))
    g.ageLabel = relativeTime(g.visitedAt, now)
    g.opacity = ageOpacity(g.visitedAt, now, i, list.length)
    g.selected = i === selectedIndex
    g.chip = ghostChip(g, resolved)
    g.railY = (i + 0.55) / Math.max(list.length + 0.2, 1)
    g.trailX = 0.58 - i * 0.052
    g.trailY = 0.26 + i * 0.068
    g.trailW = 0.36 - i * 0.014
    g.trailH = 0.24 - i * 0.01
    out.push(g)
  }
  return out
}

function noopSpec() {
  return { kind: "noop", dispatch: "", fallback: "", argv: [] }
}

function demoSpec() {
  return { kind: "demo", dispatch: "", fallback: "", argv: [] }
}

function workspaceFocusToken(ghost) {
  if (!ghost) return ""
  var id = ghost.workspaceId
  if (id === undefined || id === null || id === "") return ""
  var token = String(id).trim()
  if (!/^[A-Za-z0-9:_./+-]+$/.test(token)) return ""
  return token
}

function jumpSpec(ghost, mode) {
  mode = String(mode || "")
  if (!ghost) return noopSpec()
  if (ghost.kind === "agent") return noopSpec()
  if (mode !== "live") {
    if (mode === "demo" || mode === "err"
      || ghost.source === "demo" || ghost.presence === "demo")
      return demoSpec()
    return noopSpec()
  }
  if (ghost.source === "demo" || ghost.presence === "demo") return demoSpec()
  if (!isLiveVisit(ghost)) return noopSpec()
  var token = workspaceFocusToken(ghost)
  if (!token) return noopSpec()
  // Same Lua dispatcher Omarchy's omarchy.workspaces widget uses:
  // Hyprland.dispatch('hl.dsp.focus({ workspace = "N" })')
  var dispatch = "hl.dsp.focus({ workspace = \"" + token + "\" })"
  return {
    kind: "hyprland",
    dispatch: dispatch,
    fallback: "workspace " + token,
    argv: ["hyprctl", "dispatch", dispatch]
  }
}

function canJump(ghost, mode) {
  return jumpSpec(ghost, mode).kind === "hyprland"
}

function parsePayload(raw) {
  var payload = {}
  try {
    payload = JSON.parse(raw || "{}") || {}
  } catch (e) {
    payload = {}
  }
  return {
    forceDemo: payload.demo === true || payload.forceDemo === true,
    selected: payload.selected !== undefined ? Math.round(number(payload.selected)) : -1
  }
}

function catalogHint(mode, agentCount) {
  var parts = []
  if (mode === "live") parts.push("hyprland trail")
  else if (mode === "stale") parts.push("stale hyprland trail")
  else if (mode === "err") parts.push("demo trail · error")
  else parts.push("demo trail")
  if (number(agentCount) > 0) parts.push(number(agentCount) + " detected agent home")
  else parts.push("no agent footprints")
  return parts.join(" · ")
}
