import QtQuick
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "smf.ghost-trace"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

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
    tooltipText: "Ghost Trace — workspace afterimages"
    fixedWidth: vertical ? barSize : Style.space(44)
    fixedHeight: vertical ? Style.space(44) : barSize
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.summonOverlay()
    }

    Item {
      anchors.fill: parent
      anchors.margins: Style.spaceReal(5)

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
          border.color: Util.alpha(Color.accent, 0.55 - index * 0.16)
          opacity: 0.85 - index * 0.22
        }
      }
    }
  }
}
