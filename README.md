# Ghost Trace

Sci-fi **workspace / session footprint trail** for [Omarchy](https://omarchy.org)
Quattro. Soft glowing ghost outlines of recently visited Hyprland workspaces
fade like afterimages. Click a ghost to jump back — **only while LIVE**.

Plugin id: `smf.ghost-trace`. Overlay plus a tiny bar-widget summoner. From
[SMF Works](https://github.com/smfworks); destined for mikesai6 Omarchy
installs when that bundle is used.

Sibling plugins: [Neural Pulse](https://github.com/smfworks/omarchy-neural-pulse),
[Cron Constellation](https://github.com/smfworks/omarchy-cron-constellation),
[Orbit Dock](https://github.com/smfworks/omarchy-orbit-dock).

Do not trust a screenshot of the trail until you have read
[docs/OPPOSITION.md](docs/OPPOSITION.md). The honesty PR makes DEMO / LIVE /
STALE / ERR *disprovable* on the overlay, every ghost, and the bar chip.

## Install

```sh
omarchy plugin add https://github.com/smfworks/omarchy-ghost-trace.git --enable
```

Plugins run **unsandboxed** inside the long-lived `omarchy-shell` process, with
your user permissions. Review this repo before enabling.

Optional bar chip (left section by default):

```sh
omarchy bar move smf.ghost-trace --section left
```

The bar face always names its mode (`DEMO` / `LIVE` / `STALE` / `ERR`) from the
same shared trail state as the overlay. Tooltip is the status line.

## Summon

Fullscreen `overlay`, same contract as first-party pickers
(`omarchy.emojis`, `omarchy.clipboard`, `omarchy.reminders`):

```sh
omarchy-shell shell summon smf.ghost-trace '{}'
omarchy-shell shell hide smf.ghost-trace
omarchy-shell shell toggle smf.ghost-trace '{}'
```

Click the bar chip to toggle the same overlay. Escape dismisses it. Click the
dimmed backdrop to dismiss.

```
bind = SUPER, G, exec, omarchy-shell shell toggle smf.ghost-trace '{}'
```

Force the DEMO trail even on a live desktop:

```sh
omarchy-shell shell summon smf.ghost-trace '{"demo":true}'
```

## Usage

- Soft neon ghost rectangles trail behind the current desktop
- An echo rail on the left lists the last 6–12 workspace visits
- Opacity decays with age: newest bright, oldest almost gone
- `←` `→` / `↑` `↓` select a ghost
- `Enter` or click jumps **only when LIVE**, via the same Hyprland helper
  `omarchy.workspaces` uses: `hl.dsp.focus({ workspace = "N" })`
- DEMO / STALE / ERR never dispatch. DEMO ghosts carry no workspace jump token
- `Escape` closes the overlay
- A successful LIVE jump pulses the selected silhouette

## DEMO vs LIVE

The honesty bar, every silhouette, every rail card, and the bar chip are
labeled so a screenshot is self-describing — same contract as Orbit Dock and
Neural Pulse:

- **LIVE** — Hyprland IPC is connected and the overlay has recorded real
  workspace visits while it stayed loaded
- **DEMO** — no Hyprland history yet (offline, CI preview, first summon
  before a switch, or `{"demo":true}`). A curated afterimage trail still fills
  the HUD. Ghosts are tagged DEMO and cannot jump
- **STALE** — showing the last live ring after Hyprland IPC failed. Cards chip
  STALE, not LIVE. Jump is disabled
- **ERR** — Hyprland IPC failed and there is no live ring; the DEMO trail is
  shown instead of a silent empty desktop. Honesty chip is ERR; ghosts chip DEMO

The HUD never fails empty. A missing focused workspace is an error (STALE if a
live ring exists, otherwise ERR) — never a silent DEMO swap over real history.

Consecutive revisits of the same Hyprland workspace are deduped; a DEMO ghost
and a live visit that share a number are not. The in-memory ring is shared
between overlay and bar, capped at 8 (clamped 6–12).

## Agents

Hermes / agent footprints appear **only when `~/.hermes/state.db` is
readable**. A `hermes` binary on `PATH` is not enough. Presence is
`DETECTED` — home visible, **no session status**. Ghost Trace never invents
Hermes titles, busy/running, or cost.

## Contract

- `schemaVersion: 1`, id `smf.ghost-trace` (not `omarchy.*`)
- `kinds: ["overlay", "bar-widget"]`
- `entryPoints.overlay: "Overlay.qml"`, `entryPoints.barWidget: "BarWidget.qml"`
- `open(payloadJson)` / `close()` for `shell summon` / `shell hide`
- `keepLoaded: true` so the layer-shell window and visit ring survive between
  summons (same reason `omarchy.reminders` and Orbit Dock keep loaded)
- Bar click runs `omarchy-shell shell toggle smf.ghost-trace '{}'` — the
  first-party `omarchy.menu` summoner pattern
- Imports `qs.Ui` / `qs.Commons` / `Quickshell.Hyprland`; no symlinks

```sh
omarchy plugin validate .
```

## Tests

```sh
node tests/test_trace_logic.js
```

Adversarial review: [docs/OPPOSITION.md](docs/OPPOSITION.md).

## Remove

```sh
omarchy plugin remove smf.ghost-trace
```

## License

MIT. Copyright (c) 2026 SMF Works.
