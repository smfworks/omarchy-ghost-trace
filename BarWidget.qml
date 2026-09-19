import QtQuick
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "TraceLogic.js" as Trace

BarWidget {
  id: root
  moduleName: "smf.ghost-trace"

  property bool hyprlandReady: false
  property bool forceDemo: false
  property string errorText: ""
  property var ring: []

  readonly property var trailState: ({
    hyprlandReady: root.hyprlandReady,
    error: root.errorText,
    ring: root.ring,
    forceDemo: root.forceDemo
  })
  readonly property string mode: Trace.trailMode(root.trailState)
  readonly property string modeLabel: Trace.trailLabel(root.mode)
  readonly property string statusText: Trace.statusLine(root.trailState)
  readonly property bool liveFace: root.mode === "live"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function syncFromShared() {
    var s = Trace.readState()
    root.hyprlandReady = s.hyprlandReady
    root.errorText = s.error
    root.ring = s.ring
    root.forceDemo = s.forceDemo
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

  function summonOverlay() {
    if (!root.bar) return
    root.bar.run("omarchy-shell shell toggle smf.ghost-trace '{}'")
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "GT"
    labelVisible: false
    keepSpace: true
    tooltipText: root.statusText
    fixedWidth: vertical ? barSize : Style.space(56)
    fixedHeight: vertical ? Style.space(56) : barSize
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.summonOverlay()
    }

    Item {
      anchors.fill: parent
      anchors.margins: Style.spaceReal(5)
      opacity: root.liveFace ? 1 : 0.42

      Repeater {
        model: 3

        Rectangle {
          required property int index
          width: parent.width * (0.78 - index * 0.14)
          height: parent.height * (0.58 - index * 0.1)
          radius: Style.space(4)
          anchors.verticalCenter: parent.verticalCenter
          anchors.horizontalCenter: parent.horizontalCenter
          anchors.horizontalCenterOffset: -index * Style.space(3)
          color: "transparent"
          border.width: 1
          border.color: Util.alpha(Color.accent, (root.liveFace ? 0.55 : 0.28) - index * 0.16)
          opacity: 0.85 - index * 0.22
        }
      }
    }

    Text {
      z: 2
      anchors.centerIn: parent
      text: root.modeLabel
      color: bar ? bar.foreground : Color.foreground
      font.family: bar ? bar.fontFamily : Style.font.family
      font.pixelSize: Style.font.caption
      font.bold: true
      font.letterSpacing: 1.1
    }
  }

  Timer {
    interval: Trace.POLL_MS
    running: true
    repeat: true
    onTriggered: root.ingestFocused()
  }

  Component.onCompleted: root.ingestFocused()
}
