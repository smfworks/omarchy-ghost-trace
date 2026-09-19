import QtQuick
import qs.Commons

Item {
  id: root

  property var ghost: ({})
  property bool selected: false
  property bool jumping: false
  property color accent: Color.accent
  property color foreground: Color.menu.text
  property color glass: Color.menu.background
  property string fontFamily: Style.font.family
  property real ghostOpacity: 0.7

  signal hovered()
  signal activated()

  readonly property var windows: (root.ghost && root.ghost.windows) ? root.ghost.windows : []
  readonly property string titleText: root.ghost && root.ghost.label ? String(root.ghost.label) : "Workspace"
  readonly property string ageText: root.ghost && root.ghost.ageLabel ? String(root.ghost.ageLabel) : ""
  readonly property string chipText: root.ghost && root.ghost.chip ? String(root.ghost.chip) : ""

  width: Style.space(196)
  height: Style.space(78)

  Rectangle {
    id: glow
    anchors.fill: parent
    anchors.margins: Style.space(-6)
    radius: Style.space(18)
    color: "transparent"
    border.width: root.selected ? 2 : 1
    border.color: Util.alpha(root.accent, root.selected ? 0.7 : 0.22 * root.ghostOpacity)
    opacity: root.selected ? 1 : 0.85
    scale: root.jumping ? 1.06 : 1

    Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
    Behavior on border.color { ColorAnimation { duration: 160 } }
  }

  Rectangle {
    id: card
    anchors.fill: parent
    radius: Style.space(14)
    color: Util.alpha(root.glass, 0.42 + root.ghostOpacity * 0.28)
    border.width: 1
    border.color: Util.alpha(root.accent, 0.18 + root.ghostOpacity * 0.45)
    opacity: clampOpacity(root.ghostOpacity)

    Column {
      anchors.fill: parent
      anchors.margins: Style.space(10)
      spacing: Style.space(6)

      Row {
        width: parent.width
        spacing: Style.space(8)

        Text {
          text: root.ghost && root.ghost.workspaceId !== undefined && root.ghost.workspaceId !== ""
            ? String(root.ghost.workspaceId)
            : "·"
          color: root.accent
          opacity: 0.95
          font.family: root.fontFamily
          font.pixelSize: Style.font.heading
          font.bold: true
          width: Style.space(28)
        }

        Column {
          width: parent.width - Style.space(36)
          spacing: Style.space(2)

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: root.titleText
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.title
            font.bold: true
            elide: Text.ElideRight
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: root.ageText
            color: root.foreground
            opacity: 0.55
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }
      }

      Row {
        width: parent.width
        spacing: Style.space(6)

        Repeater {
          model: root.windows

          Rectangle {
            id: pane
            required property var modelData
            width: Style.space(36)
            height: Style.space(18)
            radius: Style.space(4)
            color: Util.alpha(root.accent, 0.1)
            border.width: 1
            border.color: Util.alpha(root.foreground, 0.16)

            Text {
              anchors.fill: parent
              anchors.margins: Style.space(2)
              textFormat: Text.PlainText
              text: root.windowCaption(pane.modelData)
              color: root.foreground
              opacity: 0.62
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
              horizontalAlignment: Text.AlignHCenter
              verticalAlignment: Text.AlignVCenter
            }
          }
        }

        Text {
          visible: root.chipText !== ""
          text: root.chipText
          color: root.accent
          opacity: 0.8
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: true
          font.letterSpacing: 1.1
        }
      }
    }
  }

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onEntered: root.hovered()
    onClicked: root.activated()
  }

  function clampOpacity(value) {
    var n = Number(value)
    if (!isFinite(n)) return 0.5
    return Math.max(0.14, Math.min(1, n))
  }

  function windowCaption(win) {
    if (!win) return ""
    var title = String(win.title || "")
    var cls = String(win.className || win.class || "")
    if (title) return title
    return cls
  }
}
