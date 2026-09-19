.pragma library

// Ghost Trace helpers. Workspace history is an in-memory ring while the
// keepLoaded overlay is mounted. DEMO ghosts are labeled DEMO. Agent
// footprints appear only when Hermes is actually detectable — never as
// invented session status.

var RING_CAP = 8
var MIN_RING = 6
var MAX_RING = 12
var MAX_AGE_MS = 12 * 60 * 1000
var MAX_WINDOWS = 4
var POLL_MS = 2000

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

function sameVisit(left, right) {
  if (!left || !right) return false
  if (String(left.kind || "workspace") !== String(right.kind || "workspace"))
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
  var next = []
  var list = ring || []
  var i
  for (i = 0; i < list.length; i++) {
    var item = cloneGhost(list[i])
    if (item) next.push(item)
  }
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
    if (String(list[i].source || "") === "hyprland") return true
  }
  return false
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
    workspaceId: id,
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
  if (flags.hermesHome === true || flags.hermesBin === true) {
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
      detail: flags.hermesHome
        ? "state.db present — no session status"
        : "hermes binary present — no session status"
    })
  }
  return out
}

function presenceLabel(entry) {
  var value = String((entry && entry.presence) || "")
  if (value === "demo") return "DEMO"
  if (value === "detected") return "DETECTED"
  if (value === "live") return "LIVE"
  return ""
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
  if (state.error && hasLiveVisits(state.ring)) return "stale"
  if (state.error) return "err"
  if (state.hyprlandReady === true && hasLiveVisits(state.ring)) return "live"
  return "demo"
}

function trailLabel(mode) {
  if (mode === "err") return "ERR"
  if (mode === "stale") return "STALE"
  if (mode === "demo") return "DEMO"
  if (mode === "live") return "LIVE"
  return String(mode || "").toUpperCase()
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
  if (mode === "live" || mode === "stale")
    return (state.ring || []).slice()
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

function decorateTrail(ghosts, now, selectedIndex) {
  var list = ghosts || []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var g = cloneGhost(list[i])
    if (!g) continue
    g.ageMs = Math.max(0, number(now) - number(g.visitedAt))
    g.ageLabel = relativeTime(g.visitedAt, now)
    g.opacity = ageOpacity(g.visitedAt, now, i, list.length)
    g.selected = i === selectedIndex
    g.chip = presenceLabel(g)
    g.railY = (i + 0.55) / Math.max(list.length + 0.2, 1)
    g.trailX = 0.58 - i * 0.052
    g.trailY = 0.26 + i * 0.068
    g.trailW = 0.36 - i * 0.014
    g.trailH = 0.24 - i * 0.01
    out.push(g)
  }
  return out
}

function jumpSpec(ghost) {
  if (!ghost) return { kind: "noop", dispatch: "", fallback: "", argv: [] }
  if (ghost.kind === "agent")
    return { kind: "noop", dispatch: "", fallback: "", argv: [] }
  if (ghost.source === "demo" || ghost.presence === "demo")
    return { kind: "demo", dispatch: "", fallback: "", argv: [] }
  var id = ghost.workspaceId
  if (id === undefined || id === null || id === "")
    return { kind: "noop", dispatch: "", fallback: "", argv: [] }
  // Same Lua dispatcher Omarchy's omarchy.workspaces widget uses:
  // hyprctl dispatch 'hl.dsp.focus({ workspace = "N" })'
  var dispatch = "hl.dsp.focus({ workspace = \"" + String(id) + "\" })"
  return {
    kind: "hyprland",
    dispatch: dispatch,
    fallback: "workspace " + String(id),
    argv: ["hyprctl", "dispatch", dispatch]
  }
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
  parts.push(mode === "live" || mode === "stale" ? "hyprland trail" : "demo trail")
  if (number(agentCount) > 0) parts.push(number(agentCount) + " detected agent home")
  else parts.push("no agent footprints")
  return parts.join(" · ")
}
