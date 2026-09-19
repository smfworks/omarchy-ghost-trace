import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import "TraceLogic.js" as Trace

Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null
  property var pluginRegistry: null

  property bool opened: false
  property bool hyprlandReady: false
  property bool forceDemo: false
  property bool hermesHome: false
  property bool hermesBin: false
  property bool jumping: false
  property string errorText: ""
  property int selectedIndex: 0
  property var ring: []
  property var displayRows: []
  property var agentRows: []

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color accent: Color.accent
  property color scrim: Color.menu.scrim
  property color border: Color.menu.border
  property string fontFamily: Style.font.menuFamily || Style.font.family
  readonly property string pluginId: (root.manifest && root.manifest.id) || "smf.ghost-trace"
  readonly property var trailState: ({
    hyprlandReady: root.hyprlandReady,
    error: root.errorText,
    ring: root.ring,
    forceDemo: root.forceDemo,
    hermesHome: root.hermesHome,
    hermesBin: root.hermesBin
  })
  readonly property string mode: Trace.trailMode(root.trailState)
  readonly property string modeLabel: Trace.trailLabel(root.mode)
  readonly property string statusText: Trace.statusLine(root.trailState)

  function syncFromShared() {
    var s = Trace.readState()
    root.hyprlandReady = s.hyprlandReady
    root.errorText = s.error
    root.ring = s.ring
    root.forceDemo = s.forceDemo
    root.hermesHome = s.hermesHome
    root.hermesBin = s.hermesBin
  }

  function open(payloadJson) {
    var payload = Trace.parsePayload(payloadJson)
    Trace.writeForceDemo(payload.forceDemo === true)
    root.opened = true
    root.ingestFocused()
    root.rebuildDisplay()
    if (payload.selected >= 0)
      root.selectedIndex = Trace.wrapIndex(payload.selected, root.displayRows.length, 0)
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
    root.jumping = false
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide(root.pluginId)
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function setHyprlandError(message) {
    Trace.markHyprlandError(message)
    root.syncFromShared()
  }

  function ingestWorkspace(workspace) {
    var ok = Trace.applyVisit(workspace, Date.now())
    root.syncFromShared()
    return ok
  }

  function ingestFocused() {
    try {
      if (typeof Hyprland === "undefined") {
        Trace.markHyprlandError("Hyprland IPC unavailable")
      } else {
        Trace.ingestFromHyprland(Hyprland, Date.now())
      }
    } catch (e) {
      Trace.markHyprlandError("Hyprland IPC failed")
    }
    root.syncFromShared()
  }

  function jumpWorkspace(ghost) {
    var spec = Trace.jumpSpec(ghost, root.mode)
    if (spec.kind !== "hyprland") {
      root.jumping = false
      return false
    }
    root.jumping = true
    jumpReset.restart()
    try {
      if (typeof Hyprland !== "undefined" && typeof Hyprland.dispatch === "function") {
        Hyprland.dispatch(spec.dispatch)
        return true
      }
    } catch (e1) {}
    try {
      if (typeof Hyprland !== "undefined" && typeof Hyprland.dispatch === "function" && spec.fallback) {
        Hyprland.dispatch(spec.fallback)
        return true
      }
    } catch (e1b) {}
    try {
      Quickshell.execDetached(spec.argv)
      return true
    } catch (e2) {
      root.setHyprlandError("workspace switch failed")
      return false
    }
  }

  function activateIndex(index) {
    if (index < 0 || index >= root.displayRows.length) return
    root.selectedIndex = index
    var ghost = root.displayRows[index]
    var jumped = root.jumpWorkspace(ghost)
    if (jumped) root.dismiss()
  }

  function selectDelta(delta) {
    if (root.displayRows.length === 0) return
    root.selectedIndex = Trace.wrapIndex(root.selectedIndex, root.displayRows.length, delta)
    root.rebuildDisplay()
  }

  function rebuildDisplay() {
    root.syncFromShared()
    var ghosts = Trace.effectiveGhosts(root.trailState, Date.now())
    root.displayRows = Trace.decorateTrail(ghosts, Date.now(), root.selectedIndex, root.mode)
    if (root.displayRows.length === 0) root.selectedIndex = 0
    else if (root.selectedIndex >= root.displayRows.length)
      root.selectedIndex = root.displayRows.length - 1
    root.agentRows = Trace.agentFootprints({
      hermesHome: root.hermesHome,
      now: Date.now()
    })
  }

  function paintField(canvas) {
    var ctx = canvas.getContext("2d")
    if (!ctx) return
    var w = canvas.width
    var h = canvas.height
    ctx.reset()
    ctx.clearRect(0, 0, w, h)
    if (w < 8 || h < 8) return
    var i
    ctx.strokeStyle = cssColor(root.accent, 0.07)
    ctx.lineWidth = 1
    for (i = 1; i < 8; i++) {
      ctx.beginPath()
      ctx.moveTo(w * 0.22 + i * 18, 0)
      ctx.lineTo(w * 0.22 + i * 48, h)
      ctx.stroke()
    }
    for (i = 0; i < root.displayRows.length; i++) {
      var row = root.displayRows[i]
      var x = w * Number(row.trailX || 0.5)
      var y = h * Number(row.trailY || 0.3)
      ctx.beginPath()
      ctx.strokeStyle = cssColor(root.accent, 0.08 + Number(row.opacity || 0.2) * 0.18)
      ctx.lineWidth = 1.2
      ctx.moveTo(x + 12, y + 8)
      ctx.lineTo(w * 0.18, h * Number(row.railY || 0.2))
      ctx.stroke()
    }
  }

  function cssColor(c, a) {
    return "rgba("
      + Math.round(c.r * 255) + ","
      + Math.round(c.g * 255) + ","
      + Math.round(c.b * 255) + ","
      + a + ")"
  }

  FileView {
    path: Quickshell.env("HOME") + "/.hermes/state.db"
    printErrors: false
    onLoaded: {
      Trace.writeHermesFlags({ hermesHome: true })
      root.syncFromShared()
      if (root.opened) root.rebuildDisplay()
    }
    onLoadFailed: {
      Trace.writeHermesFlags({ hermesHome: false })
      root.syncFromShared()
      if (root.opened) root.rebuildDisplay()
    }
  }

  property var focusedWorkspace: {
    try { return Hyprland.focusedWorkspace } catch (e) { return null }
  }
  onFocusedWorkspaceChanged: root.ingestFocused()

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "smf-ghost-trace"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    Canvas {
      id: field
      anchors.fill: parent
      renderStrategy: Canvas.Cooperative
      onPaint: root.paintField(field)
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    Item {
      id: keyCatcher
      anchors.fill: parent
      focus: true

      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Escape) {
          root.dismiss()
          event.accepted = true
        } else if (event.key === Qt.Key_Up || event.key === Qt.Key_Left) {
          root.selectDelta(-1)
          event.accepted = true
        } else if (event.key === Qt.Key_Down || event.key === Qt.Key_Right) {
          root.selectDelta(1)
          event.accepted = true
        } else if (event.key === Qt.Key_Home) {
          root.selectedIndex = 0
          root.rebuildDisplay()
          event.accepted = true
        } else if (event.key === Qt.Key_End) {
          root.selectedIndex = Math.max(0, root.displayRows.length - 1)
          root.rebuildDisplay()
          event.accepted = true
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
          root.activateIndex(root.selectedIndex)
          event.accepted = true
        }
      }
    }

    Repeater {
      model: root.displayRows

      Rectangle {
        required property var modelData
        required property int index
        readonly property real ox: Number(modelData.trailX || 0.5)
        readonly property real oy: Number(modelData.trailY || 0.3)
        readonly property real ow: Number(modelData.trailW || 0.3)
        readonly property real oh: Number(modelData.trailH || 0.2)
        readonly property real fade: Number(modelData.opacity || 0.4)

        width: panel.width * ow
        height: panel.height * oh
        x: panel.width * ox
        y: panel.height * oy
        radius: Style.space(16)
        color: Util.alpha(root.background, 0.08 + fade * 0.16)
        border.width: index === root.selectedIndex ? 2 : 1
        border.color: Util.alpha(root.accent, (index === root.selectedIndex ? 0.7 : 0.22) * fade)
        opacity: fade
        z: index === root.selectedIndex ? 8 : 4
        scale: root.jumping && index === root.selectedIndex ? 1.04 : 1

        Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

        Column {
          anchors.fill: parent
          anchors.margins: Style.space(16)
          spacing: Style.space(8)

          Row {
            width: parent.width
            spacing: Style.space(10)

            Text {
              textFormat: Text.PlainText
              text: String(modelData.label || modelData.name || "")
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.heading
              font.bold: true
              opacity: 0.9
            }

            Text {
              text: String(modelData.chip || root.modeLabel)
              color: root.accent
              opacity: 0.85
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1.2
              anchors.verticalCenter: parent.verticalCenter
            }
          }

          Repeater {
            model: modelData.windows || []

            Rectangle {
              id: pane
              required property var modelData
              width: parent.width * 0.72
              height: Style.space(14)
              radius: Style.space(4)
              color: Util.alpha(root.accent, 0.08)
              border.width: 1
              border.color: Util.alpha(root.foreground, 0.12)

              Text {
                anchors.fill: parent
                anchors.leftMargin: Style.space(8)
                textFormat: Text.PlainText
                text: String((pane.modelData && (pane.modelData.title || pane.modelData.className)) || "")
                color: root.foreground
                opacity: 0.55
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
              }
            }
          }
        }

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onEntered: {
            root.selectedIndex = index
            root.rebuildDisplay()
          }
          onClicked: root.activateIndex(index)
        }
      }
    }

    Rectangle {
      id: rail
      width: Math.min(Style.space(228), panel.width * 0.28)
      height: Math.min(panel.height - Style.space(72), Style.space(620))
      radius: Style.space(22)
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: parent.left
      anchors.leftMargin: Style.space(28)
      color: Util.alpha(root.background, 0.72)
      border.width: 1
      border.color: Util.alpha(root.accent, 0.4)
      z: 20

      MouseArea { anchors.fill: parent; onClicked: {} }

      Column {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(10)

        Text {
          id: railTitle
          width: parent.width
          text: "GHOST TRACE"
          color: root.accent
          opacity: 0.82
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.letterSpacing: 2.2
          font.bold: true
        }

        Text {
          id: railStatus
          width: parent.width
          textFormat: Text.PlainText
          text: root.statusText
          color: root.foreground
          opacity: 0.62
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        Flickable {
          width: parent.width
          height: Math.max(Style.space(80), parent.height - railTitle.height - railStatus.height - Style.space(24))
          clip: true
          contentWidth: width
          contentHeight: railColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick

          Column {
            id: railColumn
            width: parent.width
            spacing: Style.space(8)

            Repeater {
              model: root.displayRows

              GhostCard {
                required property var modelData
                required property int index
                width: railColumn.width
                ghost: modelData
                selected: index === root.selectedIndex
                jumping: root.jumping && index === root.selectedIndex
                ghostOpacity: Number(modelData.opacity || 0.5)
                accent: root.accent
                foreground: root.foreground
                glass: root.background
                fontFamily: root.fontFamily
                onHovered: {
                  root.selectedIndex = index
                  root.rebuildDisplay()
                }
                onActivated: root.activateIndex(index)
              }
            }

            Repeater {
              model: root.agentRows

              Rectangle {
                required property var modelData
                width: railColumn.width
                height: Style.space(36)
                radius: Style.space(8)
                color: Util.alpha(root.accent, 0.08)
                border.width: 1
                border.color: Util.alpha(root.accent, 0.28)

                Text {
                  anchors.fill: parent
                  anchors.margins: Style.space(8)
                  textFormat: Text.PlainText
                  text: String(modelData.label || "Hermes") + " · " + Trace.presenceLabel(modelData)
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                  verticalAlignment: Text.AlignVCenter
                }
              }
            }
          }
        }
      }
    }

    Rectangle {
      id: honesty
      anchors.top: parent.top
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.topMargin: Style.space(22)
      width: honestyRow.implicitWidth + Style.space(28)
      height: Style.space(36)
      radius: height / 2
      color: Util.alpha(root.background, 0.78)
      border.width: 1
      border.color: Util.alpha(root.accent, 0.55)
      z: 30

      Row {
        id: honestyRow
        anchors.centerIn: parent
        spacing: Style.space(10)

        Rectangle {
          width: chipLabel.implicitWidth + Style.space(14)
          height: Style.space(20)
          radius: height / 2
          color: Util.alpha(root.accent, root.mode === "live" ? 0.28 : 0.16)
          border.width: 1
          border.color: Util.alpha(root.accent, 0.7)

          Text {
            id: chipLabel
            anchors.centerIn: parent
            text: root.modeLabel
            color: root.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.4
          }
        }

        Text {
          text: Trace.catalogHint(root.mode, root.agentRows.length)
          color: root.foreground
          opacity: 0.62
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          anchors.verticalCenter: parent.verticalCenter
        }
      }
    }

    Text {
      anchors.bottom: parent.bottom
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.bottomMargin: Style.space(28)
      z: 30
      text: "ESC close · ENTER jump · ← → select"
      color: root.foreground
      opacity: 0.48
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.letterSpacing: 1.1
    }
  }

  Timer {
    interval: Trace.POLL_MS
    running: true
    repeat: true
    onTriggered: {
      root.ingestFocused()
      if (root.opened) {
        root.rebuildDisplay()
        field.requestPaint()
      }
    }
  }

  Timer {
    id: jumpReset
    interval: 420
    repeat: false
    onTriggered: root.jumping = false
  }

  Component.onCompleted: {
    root.ingestFocused()
    root.rebuildDisplay()
  }
}
