import QtQuick

// CinePro/ui's StartupOverlay loading phase, available before its server starts.
Rectangle {
    id: splash
    objectName: "cinepro-loading"
    property real uiScale: 1
    color: "#0a0a0a"
    Accessible.role: Accessible.ProgressBar
    Accessible.name: "Loading CinePro"

    Canvas {
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            const ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            const radius = Math.sqrt(width * width + height * height) * 0.225;
            const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, radius);
            glow.addColorStop(0, "rgba(255,255,255,0.08)");
            glow.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);
        }
    }
    Column {
        anchors.centerIn: parent
        width: Math.min(parent.width * 0.88, 420 * splash.uiScale)
        spacing: 20 * splash.uiScale
        Item {
            width: parent.width; height: 112 * splash.uiScale
            Image {
                anchors.centerIn: parent
                width: 40 * 558 / 478 * splash.uiScale; height: 40 * splash.uiScale
                source: "qrc:/src/assets/cinepro-loading.svg"
                sourceSize.width: width; sourceSize.height: height
                fillMode: Image.PreserveAspectFit
            }
        }
        Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: "CinePro/ui"; color: "#fafafa"
            font.pixelSize: 36 * splash.uiScale
            font.weight: Font.DemiBold; font.letterSpacing: -0.9 * splash.uiScale
        }
        Rectangle {
            id: track
            width: parent.width; height: 6 * splash.uiScale
            radius: height / 2; color: "#262626"
            Rectangle {
                id: progress
                height: parent.height; radius: height / 2
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#ea383e" }
                    GradientStop { position: 0.5; color: "#82181a" }
                    GradientStop { position: 1; color: "#ea383e" }
                }
                // Startup has no measurable percentage; repeat while it is pending.
                NumberAnimation on width {
                    from: 0; to: track.width; duration: 2000
                    loops: Animation.Infinite; running: splash.visible
                }
            }
        }
        Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: "LOADING"; color: "#a1a1a1"
            font.pixelSize: 12 * splash.uiScale
            font.italic: true; font.letterSpacing: 3.6 * splash.uiScale
        }
    }
}
