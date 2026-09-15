import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts

FocusScope {
    id: controls
    objectName: "playback-controls"
    required property var player
    property var playback: ({id: "", position: 0, duration: 0, paused: false, loading: false, ended: false, volume: 100, tracks: []})
    property var movie: ({title: "", edition: ""})
    property var availableTracks: []
    readonly property bool playing: playback.id !== ""
    property bool awake: true
    property real previousVolume: 100
    readonly property bool chromeVisible: awake || playback.paused || playback.loading || playback.ended || tracks.opened
    visible: playing

    function time(seconds) {
        const n = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(n / 60);
        return (minutes >= 60 ? Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0") : minutes) + ":" + String(n % 60).padStart(2, "0");
    }
    function wake() { awake = true; hideTimer.restart(); }
    function togglePlayback() {
        if (playback.ended) player.seek(0);
        player.pause();
        wake();
    }
    function navigate(button, direction) {
        const items = [pauseButton, rewindButton, forwardButton, muteButton, volumeSlider, tracksButton, fullscreenButton];
        const index = items.indexOf(button);
        items[Math.max(0, Math.min(items.length - 1, index + direction))].forceActiveFocus();
        wake();
    }
    function navigateTracks(button, direction) {
        const items = [closeTracks].concat(trackColumn.children.filter(item => item.objectName &&
            (item.objectName.indexOf("-track-") >= 0 || item.objectName === "sub-off")));
        const index = items.indexOf(button);
        items[Math.max(0, Math.min(items.length - 1, index + direction))].forceActiveFocus();
    }
    Timer { id: hideTimer; interval: 4500; onTriggered: {
        if (tracks.opened || controls.playback.paused || controls.playback.loading) return;
        controls.awake = false;
        controls.forceActiveFocus();
    } }
    Shortcut {
        sequence: "Space"
        enabled: controls.playing && !tracks.opened
        onActivated: controls.togglePlayback()
    }
    Connections {
        target: controls.player
        function onPlaybackChanged(value) {
            const next = JSON.parse(value);
            if (next.id !== controls.playback.id) {
                controls.movie = JSON.parse(controls.player.library()).movies.find(m => m.id === next.id) || {};
                controls.wake();
            }
            controls.playback = next;
            // Keep delegates alive when selection changes, preserving remote focus.
            const catalog = next.tracks.map(t => ({ id: t.id, type: t.type, title: t.title, lang: t.lang }));
            if (JSON.stringify(catalog) !== JSON.stringify(controls.availableTracks))
                controls.availableTracks = catalog;
        }
    }
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        wake();
        if (tracks.opened) {
            if (event.key === Qt.Key_Escape || event.key === Qt.Key_Backspace) { tracks.close(); event.accepted = true; }
            return;
        }
        if (event.key === Qt.Key_Escape || event.key === Qt.Key_Backspace) player.stop();
        else if (event.key === Qt.Key_F) player.fullscreen();
        else if (event.key === Qt.Key_S) tracks.open();
        else if (event.key === Qt.Key_Left) player.seekRelative(-10);
        else if (event.key === Qt.Key_Right) player.seekRelative(+10);
        else if (event.key === Qt.Key_Down) pauseButton.forceActiveFocus();
        else if (event.key === Qt.Key_Up) timeline.forceActiveFocus();
        else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) togglePlayback();
        else return;
        event.accepted = true;
    }

    component PlayerIcon: Canvas {
        property string symbol: ""
        property color ink: "white"
        onSymbolChanged: requestPaint()
        onInkChanged: requestPaint()
        onPaint: {
            const c = getContext("2d");
            c.reset(); c.scale(width / 32, height / 32);
            c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round";
            function line(points) { c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.stroke(); }
            if (symbol === "play") { c.beginPath(); c.moveTo(10, 5); c.lineTo(27, 16); c.lineTo(10, 27); c.closePath(); c.fill(); }
            else if (symbol === "pause") { c.fillRect(8, 6, 5, 20); c.fillRect(20, 6, 5, 20); }
            else if (symbol === "back") { line([19, 7, 10, 16, 19, 25]); }
            else if (symbol === "close") { line([8, 8, 24, 24]); line([24, 8, 8, 24]); }
            else if (symbol === "rewind" || symbol === "forward") {
                if (symbol === "forward") { c.translate(32, 0); c.scale(-1, 1); }
                c.beginPath(); c.arc(16, 17, 12, -2.1, 3.8); c.stroke(); line([7, 3, 7, 11, 15, 11]);
                if (symbol === "forward") { c.translate(32, 0); c.scale(-1, 1); }
                c.font = "bold 12px sans-serif"; c.textAlign = "center"; c.fillText("10", 16, 22);
            }
            else if (symbol === "volume" || symbol === "muted") {
                c.beginPath(); c.moveTo(4, 12); c.lineTo(10, 12); c.lineTo(17, 6); c.lineTo(17, 26); c.lineTo(10, 20); c.lineTo(4, 20); c.closePath(); c.fill();
                if (symbol === "muted") { line([23, 12, 29, 20]); line([29, 12, 23, 20]); }
                else { c.beginPath(); c.arc(16, 16, 9, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(16, 16, 14, -0.8, 0.8); c.stroke(); }
            }
            else if (symbol === "captions") { c.strokeRect(3, 7, 26, 19); line([8, 14, 12, 14]); line([17, 14, 24, 14]); line([8, 20, 20, 20]); }
            else if (symbol === "fullscreen") { line([4, 12, 4, 4, 12, 4]); line([20, 4, 28, 4, 28, 12]); line([28, 20, 28, 28, 20, 28]); line([12, 28, 4, 28, 4, 20]); }
        }
    }
    component CinemaButton: Button {
        id: button
        property string symbol: ""
        property bool selected: false
        implicitHeight: 80
        implicitWidth: symbol && !text ? 80 : Math.max(80, label.implicitWidth + (symbol ? 84 : 40))
        hoverEnabled: true
        font.pixelSize: 24
        focusPolicy: Qt.StrongFocus
        Accessible.name: text
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: event => {
            controls.wake();
            if (tracks.opened && [Qt.Key_Up, Qt.Key_Down, Qt.Key_Left, Qt.Key_Right].includes(event.key)) {
                controls.navigateTracks(button, event.key === Qt.Key_Up || event.key === Qt.Key_Left ? -1 : 1);
            } else if (!tracks.opened && (event.key === Qt.Key_Left || event.key === Qt.Key_Right)) {
                controls.navigate(button, event.key === Qt.Key_Left ? -1 : 1);
            } else if (!tracks.opened && event.key === Qt.Key_Up) timeline.forceActiveFocus();
            else if (!tracks.opened && event.key === Qt.Key_Down) pauseButton.forceActiveFocus();
            else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) button.clicked();
            else { event.accepted = false; return; }
            event.accepted = true;
        }
        onActiveFocusChanged: if (activeFocus && tracks.opened && button !== closeTracks) Qt.callLater(() => {
            const y = button.mapToItem(trackColumn, 0, 0).y;
            const viewport = trackScroll.contentItem;
            if (y < viewport.contentY) viewport.contentY = y;
            else if (y + height > viewport.contentY + trackScroll.availableHeight)
                viewport.contentY = y + height - trackScroll.availableHeight;
        })
        contentItem: Item {
            PlayerIcon { visible: button.symbol !== ""; anchors.verticalCenter: parent.verticalCenter; x: button.text ? 10 : (parent.width - width) / 2; width: 34; height: 34; symbol: button.symbol; ink: button.activeFocus || button.down ? "#101114" : "#ffffff" }
            Text {
                id: label; anchors.fill: parent; anchors.leftMargin: button.symbol ? 46 : 0
                text: button.text; color: button.activeFocus || button.down ? "#101114" : "#ffffff"
                font: button.font; elide: Text.ElideRight
                horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
            }
        }
        background: Rectangle {
            radius: 16
            color: button.activeFocus || button.down ? "#ffffff" : button.hovered || button.selected ? "#35ffffff" : "transparent"
            border.width: button.selected ? 1 : 0; border.color: "#70ffffff"
            Rectangle { anchors.fill: parent; anchors.margins: -5; visible: button.activeFocus; radius: 21; color: "transparent"; border.color: "#aaffffff"; border.width: 2 }
        }
        onHoveredChanged: if (hovered) controls.wake()
    }
    component CinemaSlider: Slider {
        id: slider
        implicitHeight: 48
        focusPolicy: Qt.StrongFocus
        hoverEnabled: true
        background: Rectangle {
            x: slider.leftPadding; y: slider.topPadding + slider.availableHeight / 2 - height / 2
            width: slider.availableWidth; height: slider.activeFocus || slider.pressed ? 10 : 6; radius: 5; color: "#65ffffff"
            Rectangle { width: slider.visualPosition * parent.width; height: parent.height; radius: 5; color: "white" }
        }
        handle: Rectangle {
            x: slider.leftPadding + slider.visualPosition * (slider.availableWidth - width)
            y: slider.topPadding + slider.availableHeight / 2 - height / 2
            width: slider.pressed || slider.activeFocus ? 26 : 16; height: width; radius: width / 2
            color: "white"; border.color: "#101114"; border.width: slider.activeFocus ? 3 : 0
        }
        onHoveredChanged: if (hovered) controls.wake()
    }

    MouseArea {
        anchors.fill: parent; hoverEnabled: true
        onPositionChanged: controls.wake()
        onClicked: { if (controls.chromeVisible) controls.player.pause(); controls.wake(); controls.forceActiveFocus(); }
        onDoubleClicked: controls.player.fullscreen()
        cursorShape: controls.chromeVisible ? Qt.ArrowCursor : Qt.BlankCursor
    }
    Item {
        anchors.fill: parent
        visible: controls.chromeVisible
        Rectangle {
            anchors.top: parent.top; width: parent.width; height: 280
            gradient: Gradient { GradientStop { position: 0; color: "#d9000000" } GradientStop { position: 1; color: "transparent" } }
        }
        RowLayout {
            anchors { top: parent.top; left: parent.left; right: parent.right; margins: 56 }
            spacing: 24
            CinemaButton { id: backButton; objectName: "back-button"; symbol: "back"; Accessible.name: "Back to collection"; onClicked: controls.player.stop() }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                Text { Layout.fillWidth: true; text: controls.movie.title || ""; color: "white"; font.pixelSize: 36; font.weight: Font.DemiBold; elide: Text.ElideRight }
                Text { Layout.fillWidth: true; text: [controls.movie.year, controls.movie.edition].filter(Boolean).join("  ·  "); visible: text !== ""; color: "#c4c4ca"; font.pixelSize: 23; elide: Text.ElideRight }
            }
            Text { text: controls.playback.paused ? "PAUSED" : ""; color: "#d0d0d5"; font.pixelSize: 18; font.letterSpacing: 3 }
        }
        Rectangle {
            anchors.bottom: parent.bottom; width: parent.width; height: 340
            gradient: Gradient { GradientStop { position: 0; color: "transparent" } GradientStop { position: 0.5; color: "#a6000000" } GradientStop { position: 1; color: "#ed000000" } }
        }
        ColumnLayout {
            anchors { bottom: parent.bottom; left: parent.left; right: parent.right; margins: 56 }
            spacing: 8
            CinemaSlider {
                id: timeline; objectName: "timeline"; Layout.fillWidth: true
                Accessible.name: "Playback position"
                from: 0; to: Math.max(1, controls.playback.duration)
                Binding on value {
                    value: controls.playback.position
                    when: !timeline.pressed
                    restoreMode: Binding.RestoreNone
                }
                enabled: controls.playback.duration > 0
                Keys.priority: Keys.BeforeItem
                Keys.onPressed: event => {
                    if (event.key === Qt.Key_Home) controls.player.seek(0);
                    else if (event.key === Qt.Key_End) controls.player.seek(controls.playback.duration);
                    else if (event.key === Qt.Key_Left) controls.player.seekRelative(-10);
                    else if (event.key === Qt.Key_Right) controls.player.seekRelative(+10);
                    else if (event.key === Qt.Key_Down) pauseButton.forceActiveFocus();
                    else if (event.key === Qt.Key_Up) backButton.forceActiveFocus();
                    else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) controls.togglePlayback();
                    else { event.accepted = false; return; }
                    controls.wake();
                    event.accepted = true;
                }
                onMoved: controls.wake()
                onPressedChanged: {
                    if (!pressed) {
                        // Capture the release position before playback updates
                        // rebind the slider, and submit exactly one seek.
                        const target = value;
                        controls.player.seek(target);
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true; spacing: 12
                CinemaButton { id: pauseButton; focus: true; objectName: "pause-button"; symbol: controls.playback.paused || controls.playback.ended ? "play" : "pause"; Accessible.name: controls.playback.paused ? "Play" : "Pause"; onClicked: controls.togglePlayback() }
                CinemaButton { id: rewindButton; objectName: "rewind-button"; symbol: "rewind"; Accessible.name: "Rewind 10 seconds"; onClicked: { controls.player.seekRelative(-10); controls.wake(); } }
                CinemaButton { id: forwardButton; objectName: "forward-button"; symbol: "forward"; Accessible.name: "Forward 10 seconds"; onClicked: { controls.player.seekRelative(+10); controls.wake(); } }
                CinemaButton { id: muteButton; objectName: "mute-button"; symbol: controls.playback.volume > 0 ? "volume" : "muted"; Accessible.name: controls.playback.volume > 0 ? "Mute" : "Unmute"; onClicked: {
                    if (controls.playback.volume > 0) { controls.previousVolume = controls.playback.volume; controls.player.volume(0); }
                    else controls.player.volume(controls.previousVolume);
                    controls.wake();
                } }
                CinemaSlider {
                    id: volumeSlider; objectName: "volume-slider"; Layout.preferredWidth: 140; from: 0; to: 100; stepSize: 5; value: controls.playback.volume; Accessible.name: "Volume"
                    onMoved: { controls.player.volume(value); controls.wake(); }
                    Keys.priority: Keys.BeforeItem
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Left || event.key === Qt.Key_Right) controls.navigate(volumeSlider, event.key === Qt.Key_Left ? -1 : 1);
                        else if (event.key === Qt.Key_Up || event.key === Qt.Key_Down) controls.player.volume(controls.playback.volume + (event.key === Qt.Key_Up ? 5 : -5));
                        else { event.accepted = false; return; }
                        controls.wake(); event.accepted = true;
                    }
                }
                Text { Layout.leftMargin: 20; text: controls.time(timeline.pressed ? timeline.value : controls.playback.position) + "  /  " + controls.time(controls.playback.duration); color: "#eeeeef"; font.pixelSize: 24 }
                Item { Layout.fillWidth: true }
                CinemaButton { id: tracksButton; objectName: "tracks-button"; symbol: "captions"; text: "Audio & subtitles"; onClicked: tracks.open() }
                CinemaButton { id: fullscreenButton; objectName: "fullscreen-button"; symbol: "fullscreen"; Accessible.name: "Full screen"; onClicked: controls.player.fullscreen() }
            }
            Text { Layout.topMargin: 14; Layout.alignment: Qt.AlignRight; text: "↑  Timeline     ← →  Controls     OK  Select     Back  Exit"; color: "#adadb5"; font.pixelSize: 19 }
        }
    }
    PlayerIcon { anchors.centerIn: parent; width: 84; height: 84; symbol: "play"; visible: controls.playback.paused && !controls.playback.loading && !tracks.opened }
    Text {
        anchors.centerIn: parent; visible: controls.playback.loading
        text: "Starting your movie…"; color: "white"; font.pixelSize: 20
    }
    Popup {
        id: tracks
        objectName: "tracks-popup"
        anchors.centerIn: parent
        width: Math.min(680, controls.width - 112)
        height: Math.min(840, controls.height - 112)
        padding: 36; modal: true; focus: true
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        onOpened: { closeTracks.forceActiveFocus(); controls.wake(); }
        onClosed: { tracksButton.forceActiveFocus(); controls.wake(); }
        background: Rectangle { color: "#f218181c"; radius: 24; border.color: "#424247" }
        contentItem: ColumnLayout {
            spacing: 24
            RowLayout {
                Layout.fillWidth: true
                Text { text: "Audio & subtitles"; color: "white"; font.pixelSize: 32; font.weight: Font.DemiBold; Layout.fillWidth: true }
                CinemaButton { id: closeTracks; objectName: "close-tracks"; symbol: "close"; Accessible.name: "Close dialog"; onClicked: tracks.close() }
            }
            ScrollView {
                id: trackScroll
                Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                contentWidth: availableWidth
                ColumnLayout {
                    id: trackColumn
                    width: trackScroll.availableWidth - 12
                    spacing: 12
                    Text { text: "AUDIO"; color: "#adadb5"; font.pixelSize: 19; font.letterSpacing: 2; Layout.topMargin: 8 }
                    Repeater {
                        model: controls.availableTracks.filter(t => t.type === "audio")
                        CinemaButton { required property var modelData; objectName: modelData.type + "-track-" + modelData.id; Layout.fillWidth: true; selected: controls.playback.tracks.some(t => t.type === "audio" && t.id === modelData.id && t.selected); text: (selected ? "✓  " : "") + (modelData.title || modelData.lang || "Audio " + modelData.id); onClicked: controls.player.track("audio", modelData.id) }
                    }
                    Text { visible: !controls.availableTracks.some(t => t.type === "audio"); text: "No audio tracks available"; color: "#adadb5"; font.pixelSize: 23 }
                    Text { text: "SUBTITLES"; color: "#adadb5"; font.pixelSize: 19; font.letterSpacing: 2; Layout.topMargin: 20 }
                    CinemaButton { objectName: "sub-off"; Layout.fillWidth: true; selected: !controls.availableTracks.some(t => t.type === "sub" && t.selected); text: (selected ? "✓  " : "") + "Off"; onClicked: controls.player.track("sub", -1) }
                    Repeater {
                        model: controls.availableTracks.filter(t => t.type === "sub")
                        CinemaButton { required property var modelData; objectName: modelData.type + "-track-" + modelData.id; Layout.fillWidth: true; selected: controls.playback.tracks.some(t => t.type === "sub" && t.id === modelData.id && t.selected); text: (selected ? "✓  " : "") + (modelData.title || modelData.lang || "Subtitle " + modelData.id); onClicked: controls.player.track("sub", modelData.id) }
                    }
                }
            }
            Text { Layout.fillWidth: true; text: "↑ ↓  Choose a track     OK  Select     Back  Close"; wrapMode: Text.WordWrap; color: "#adadb5"; font.pixelSize: 20 }
        }
    }
}
