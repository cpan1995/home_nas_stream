import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic
import QtWebEngine
import QtWebChannel
import ScreeningRoom 1.0

Window {
    id: root
    width: 1440; height: 900
    visible: true
    title: "Screening Room"
    color: "#EAF3FA"
    property real uiScale: Math.min(width / 1920, height / 1080)
    property bool onlineFullscreen: false
    property bool wasFullscreen: false
    property url cineproBrowseUrl: cineproSession.url
    function switchTab(online) {
        if (playback.playing) return;
        if (onlineFullscreen && onlineView.item) onlineView.item.fullScreenCancelled();
        cineproSession.active = online;
        if (!online) Qt.callLater(function() { web.forceActiveFocus(); });
    }
    function focusContent() {
        if (cineproSession.active && onlineView.item) onlineView.item.focusContent();
        else if (cineproSession.active && !cineproSession.starting) serviceRetry.forceActiveFocus();
        else if (!cineproSession.active) web.forceActiveFocus();
    }
    // Commands come only from the native LAN receiver, never from provider frames.
    function remoteCommand(key) {
        if (key.indexOf("Volume_") === 0) {
            const volume = Number(key.substring(7));
            if (!cineproSession.active) {
                videoBackend.volume(volume);
                networkRemote.setVolumeState(volume);
            } else if (onlineView.item) {
                onlineView.item.runJavaScript(`(() => {
                    const slider = document.querySelector('[data-cinema-player] input[aria-label="Volume"]');
                    if (!slider) return;
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, String(${volume} / 100));
                    slider.dispatchEvent(new Event('input', {bubbles:true}));
                    slider.dispatchEvent(new Event('change', {bubbles:true}));
                })()`);
            }
            return;
        }
        if (key === "Home" || key === "CinePro" || key === "CineProHome") {
            if (playback.playing) videoBackend.stop();
            if (key === "CineProHome") {
                root.cineproBrowseUrl = cineproSession.url;
                if (onlineView.item) onlineView.item.url = cineproSession.url;
            }
            root.switchTab(key !== "Home");
            if (key === "Home") web.reload();
            Qt.callLater(root.focusContent);
            return;
        }
        if (playback.playing) {
            playback.wake();
            const current = JSON.parse(videoBackend.playbackState());
            if (key === "Play") { playback.togglePlayback(); return; }
            if (key === "Rev" || key === "InstantReplay") { videoBackend.seekRelative(-10); return; }
            if (key === "Fwd") { videoBackend.seekRelative(10); return; }
            if (key === "VolumeUp" || key === "VolumeDown") {
                videoBackend.volume(Math.max(0, Math.min(100, current.volume + (key === "VolumeUp" ? 5 : -5)))); return;
            }
            if (key === "VolumeMute") {
                if (current.volume > 0) { playback.previousVolume = current.volume; videoBackend.volume(0); }
                else videoBackend.volume(playback.previousVolume);
                return;
            }
        } else {
            const view = cineproSession.active ? onlineView.item : web;
            if (!view) { root.focusContent(); return; }
            view.forceActiveFocus();
            if (key === "Search") {
                view.runJavaScript("document.querySelector('[data-remote-search], .search-control')?.click()"); return;
            }
            if (["Play", "Rev", "Fwd", "InstantReplay", "VolumeUp", "VolumeDown", "VolumeMute"].indexOf(key) >= 0) {
                // Operate the trusted parent page's existing controls. Provider frames
                // retain their isolated profile and never receive a native bridge.
                view.runJavaScript(`(() => {
                    const key = ${JSON.stringify(key)};
                    const player = document.querySelector('[data-cinema-player]');
                    if (!player) return;
                    const labels = {Rev: 'Rewind 10 seconds', InstantReplay: 'Rewind 10 seconds', Fwd: 'Forward 10 seconds'};
                    if (key === 'Play') player.querySelector('[data-remote-default]')?.click();
                    else if (labels[key]) player.querySelector('[aria-label="' + labels[key] + '"]')?.click();
                    else if (key === 'VolumeMute') player.querySelector('[aria-label="Mute"], [aria-label="Unmute"]')?.click();
                    else {
                        const slider = player.querySelector('input[aria-label="Volume"]');
                        if (!slider) return;
                        const value = Math.max(0, Math.min(1, Number(slider.value) + (key === 'VolumeUp' ? .05 : -.05)));
                        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, String(value));
                        slider.dispatchEvent(new Event('input', {bubbles:true}));
                        slider.dispatchEvent(new Event('change', {bubbles:true}));
                    }
                })()`);
                return;
            }
        }
        networkRemote.sendKey(key);
    }
    Timer {
        interval: 1000; running: true; repeat: true; triggeredOnStart: true
        onTriggered: {
            if (!cineproSession.active) networkRemote.setVolumeState(JSON.parse(videoBackend.playbackState()).volume);
            else if (onlineView.item) {
                const view = onlineView.item;
                view.runJavaScript("(() => { const slider = document.querySelector('[data-cinema-player] input[aria-label=\"Volume\"]'); return slider ? Math.round(Number(slider.value) * 100) : -1; })()", function(value) {
                    if (cineproSession.active && onlineView.item === view) networkRemote.setVolumeState(typeof value === "number" ? value : -1);
                });
            } else networkRemote.setVolumeState(-1);
        }
    }
    Connections {
        target: networkRemote
        function onCommand(key) { root.remoteCommand(key); }
    }
    Shortcut { sequence: "Ctrl+1"; enabled: !playback.playing; onActivated: root.switchTab(false) }
    Shortcut { sequence: "Ctrl+2"; enabled: !playback.playing; onActivated: root.switchTab(true) }
    Shortcut { sequence: "F6"; enabled: !playback.playing; onActivated: root.focusContent() }
    Shortcut {
        sequence: "Escape"; enabled: root.onlineFullscreen
        onActivated: if (onlineView.item) onlineView.item.fullScreenCancelled()
    }
    VideoPlayer {
        id: videoBackend
        objectName: "player"
        anchors.fill: parent
        WebChannel.id: "player"
        onCineProRequested: root.switchTab(true)
    }
    WebChannel { id: channel; registeredObjects: [videoBackend] }
    WebEngineView {
        id: web
        objectName: "web"
        anchors.left: parent.left; anchors.right: parent.right
        anchors.top: parent.top; anchors.bottom: parent.bottom
        backgroundColor: "transparent"
        visible: !playback.playing && !cineproSession.active
        webChannel: channel
        profile: WebEngineProfile {
            offTheRecord: true
            httpCacheType: WebEngineProfile.MemoryHttpCache
            persistentCookiesPolicy: WebEngineProfile.NoPersistentCookies
        }
        url: "qrc:/ui/index.html"
        settings.localContentCanAccessFileUrls: true
        settings.localContentCanAccessRemoteUrls: true
        onNavigationRequested: function(request) {
            if (request.url.toString() !== "qrc:/ui/index.html") request.action = WebEngineNavigationRequest.IgnoreRequest;
        }
        onNewWindowRequested: function(request) { /* The player never opens external windows. */ }
        onWindowCloseRequested: root.close()
        onJavaScriptConsoleMessage: function(level, message, line, source) { console.log("UI:", message, source, line) }
    }
    Loader {
        id: onlineView
        anchors.left: parent.left; anchors.right: parent.right
        anchors.top: parent.top; anchors.bottom: parent.bottom
        // Destroy the page on leaving the tab, so hidden streams cannot keep playing.
        active: cineproSession.active && cineproSession.ready
        sourceComponent: WebEngineView {
            id: cineproWeb
            objectName: "cinepro-web"
            property bool loadFailed: false
            function focusContent() {
                if (loadFailed) pageRetry.forceActiveFocus();
                else forceActiveFocus();
            }
            backgroundColor: "#090b10"
            Component.onCompleted: url = root.cineproBrowseUrl
            profile: FilteredWebProfile {
                objectName: "online-profile"
                // Hide only MoviesAPI's duplicate Vidstack controls. Keep its video,
                // captions, loading and error elements intact; no native bridge is exposed.
                // Qt 6.8's dictionary parser reads runOnSubframes; newer Qt reads
                // runsOnSubFrames. Set both spellings so Pi embeds receive the adapters.
                userScripts.collection: [{
                    name: "screening-room-quality",
                    injectionPoint: WebEngineScript.DocumentCreation,
                    worldId: WebEngineScript.ApplicationWorld,
                    runsOnSubFrames: true,
                    runOnSubframes: true,
                    sourceCode: qualityAdapterSource
                        .replace('__SCREENING_ROOM_ORIGIN__', JSON.stringify(cineproSession.url.toString().split('/').slice(0, 3).join('/')))
                        .replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providerOrigins))
                }, {
                    name: "screening-room-provider-chrome",
                    injectionPoint: WebEngineScript.DocumentReady,
                    worldId: WebEngineScript.ApplicationWorld,
                    runsOnSubFrames: true,
                    runOnSubframes: true,
                    sourceCode: `(() => {
                        const providers = __SCREENING_ROOM_PROVIDERS__;
                        if (window === window.top || location.origin !== providers.moviesapi) return;
                        const style = document.createElement('style');
                        style.id = 'screening-room-provider-chrome';
                        style.textContent = '[data-media-player] [class^="_controls_"], [data-media-player] [class*=" _controls_"] { display: none !important; }';
                        document.head.appendChild(style);
                    })();`.replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providerOrigins))
                }, {
                    name: "screening-room-video-controls",
                    injectionPoint: WebEngineScript.DocumentReady,
                    worldId: WebEngineScript.ApplicationWorld,
                    runsOnSubFrames: true,
                    runOnSubframes: true,
                    sourceCode: `(() => {
                        const allowedParent = ${JSON.stringify(cineproSession.url.toString().split('/').slice(0, 3).join('/'))};
                        const providers = __SCREENING_ROOM_PROVIDERS__;
                        if (window === window.top || !Object.values(providers).filter(origin => origin !== providers.moviesapi).includes(location.origin)) return;
                        // Only media controls and status cross this boundary. No URLs, files or native bridge.
                        let video = null;
                        let missingVideoSeconds = 0, lastVideoTime = 0, videoUnavailable = false;
                        const status = (event = 'playerstatus') => {
                            if (!video) return;
                            window.parent.postMessage({source: 'screening-room-player', event: videoUnavailable ? 'error' : event,
                                errorCode: videoUnavailable ? 'video-unavailable' : undefined,
                                currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
                                duration: Number.isFinite(video.duration) ? video.duration : 0,
                                paused: video.paused, ready: video.readyState > 0}, allowedParent);
                        };
                        const discover = () => {
                            const next = document.querySelector('video');
                            if (next === video) return;
                            if (video) for (const name of ['play', 'pause', 'ended', 'seeked', 'error', 'loadstart']) video.removeEventListener(name, onMedia);
                            video = next;
                            missingVideoSeconds = 0; lastVideoTime = 0; videoUnavailable = false;
                            if (!video) return;
                            for (const name of ['play', 'pause', 'ended', 'seeked', 'error', 'loadstart']) video.addEventListener(name, onMedia);
                            if (!document.querySelector('#screening-room-video-controls')) {
                                const style = document.createElement('style');
                                style.id = 'screening-room-video-controls';
                                style.textContent = '[data-media-player] [class^="_controls_"], [data-media-player] [class*=" _controls_"], .vds-controls, .vds-gestures, [class^="video-layout_controls__"] { display: none !important; }';
                                if (location.origin === providers.anixo) style.textContent += ' #controls, #top-bar, #center-indicator, #click-area, #dt-left, #dt-right, #skip-intro-btn, #skip-outro-btn { display: none !important; }';
                                if (location.origin === providers.rivestream) style.textContent += ' .art-bottom, .art-mask, .art-contextmenus, .strata-player-reset > .absolute.bottom-0, .strata-player-reset > .absolute.inset-0.flex, [class*="style_watchBarContainer__"], [class*="style_edgeHandleContainer__"] { display: none !important; } .strata-subtitle-overlay { bottom: 12% !important; }';
                                document.head.appendChild(style);
                            }
                            status();
                        };
                        const onMedia = event => {
                            if (event.type === 'loadstart') { missingVideoSeconds = 0; lastVideoTime = 0; videoUnavailable = false; }
                            if (event.type === 'seeked') { missingVideoSeconds = 0; lastVideoTime = video.currentTime; }
                            status(event.type);
                        };
                        const checkVideo = () => {
                            if (!video) return;
                            // DASH can discard an unsupported video track and keep playing audio
                            // without raising MediaError. Require sustained playback, not loading
                            // time or a seek jump, before treating zero dimensions as a failure.
                            const advance = video.currentTime - lastVideoTime;
                            lastVideoTime = video.currentTime;
                            if (video.videoWidth > 0 && video.videoHeight > 0) {
                                missingVideoSeconds = 0; videoUnavailable = false;
                            } else if (!video.paused && !video.seeking && video.readyState >= 2 && advance > 0 && advance < 3) {
                                missingVideoSeconds += advance;
                                if (missingVideoSeconds >= 5) videoUnavailable = true;
                            } else missingVideoSeconds = 0;
                            if (videoUnavailable && !video.paused) video.pause();
                        };
                        window.addEventListener('message', event => {
                            if (event.source !== window.parent || event.origin !== allowedParent || event.data?.source !== 'screening-room-control') return;
                            discover();
                            if (!video) return;
                            const data = event.data;
                            try {
                                if (data.action === 'play') {
                                    if (videoUnavailable) { status(); return; }
                                    // Some providers initialise their source only through their own Play control.
                                    if (!video.currentSrc && location.origin === providers.vidlink) document.querySelector('button[aria-label="Play"]')?.click();
                                    video.play().catch(error => { if (error.name !== 'AbortError') status('error'); });
                                }
                                else if (data.action === 'pause') video.pause();
                                else if (data.action === 'seek' && Number.isFinite(data.time)) video.currentTime = Math.max(0, Math.min(video.duration || data.time, data.time));
                                else if (data.action === 'setVolume' && Number.isFinite(data.volume)) {
                                    video.volume = Math.max(0, Math.min(1, data.volume)); video.muted = video.volume === 0;
                                } else if (data.action !== 'getStatus') return;
                                status();
                            } catch (_) { status('error'); }
                        });
                        discover();
                        const timer = setInterval(() => { discover(); checkVideo(); status(); }, 1000);
                        window.addEventListener('pagehide', () => { clearInterval(timer); if (video) video.pause(); }, {once: true});
                    })();`.replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providerOrigins))
                }, {
                    name: "screening-room-track-controls",
                    injectionPoint: WebEngineScript.DocumentReady,
                    worldId: WebEngineScript.ApplicationWorld,
                    runsOnSubFrames: true,
                    runOnSubframes: true,
                    sourceCode: `(() => {
                        const allowedParent = ${JSON.stringify(cineproSession.url.toString().split('/').slice(0, 3).join('/'))};
                        const providers = __SCREENING_ROOM_PROVIDERS__;
                        if (window === window.top || !Object.values(providers).includes(location.origin)) return;
                        let commands = new Map();
                        const clean = value => String(value || '').trim().slice(0, 160);
                        // Rivestream's Strata player loads subtitles through its menu;
                        // textTracks contains only the currently loaded language.
                        const riveSubtitleMenu = () => {
                            if (location.origin !== providers.rivestream) return null;
                            const toggle = document.querySelector('.strata-control-btn svg rect[width="18"][height="14"]')?.closest('button');
                            if (toggle && !toggle.parentElement.querySelector('.strata-backdrop')) toggle.click();
                            return toggle?.parentElement.querySelector('.strata-backdrop');
                        };
                        const activate = node => {
                            // Vidstack radio items use pointerup rather than click. Both
                            // events select a specific radio value; they never toggle it.
                            node.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, button: 0}));
                            node.click();
                        };
                        const collect = () => {
                            commands = new Map();
                            const video = document.querySelector('video');
                            const subtitles = [], audio = [], seen = new Set();
                            const nativeSubs = Array.from(video?.textTracks || []).filter(t => t.kind === 'subtitles' || t.kind === 'captions');
                            // VidFast's MUI subtitle rows are divs inside a button, not
                            // radio items. Changing textTracks alone does not update its
                            // caption renderer. Activate the provider's language row.
                            const vidfast = location.origin === providers.vidfast;
                            const fastMenu = vidfast ? Array.from(document.querySelectorAll('button')).find(node =>
                                node.textContent.includes('Upload Subtitles') && node.textContent.includes('Customize')) : null;
                            const fastLeaves = Array.from(fastMenu?.querySelectorAll('div, span') || []).filter(node => node.childElementCount === 0);
                            const fastOff = fastLeaves.find(node => clean(node.textContent) === 'Off');
                            const fastSummary = vidfast ? Array.from(document.querySelectorAll('button div')).find(node =>
                                node.childElementCount === 0 && clean(node.textContent) === 'Subtitles')?.parentElement : null;
                            const fastSelected = fastSummary ? clean(fastSummary.lastElementChild?.textContent) : '';
                            // The language list follows Off. It can exist before the
                            // provider has created/loaded any HTML text tracks.
                            const fastOptions = fastOff ? fastLeaves.slice(fastLeaves.indexOf(fastOff) + 1) : [];
                            fastOptions.forEach(node => {
                                const label = clean(node.textContent);
                                if (!label || seen.has(label)) return;
                                seen.add(label);
                                const id = 'sub:vidfast:' + label;
                                const loaded = nativeSubs.some(track => clean(track.label || track.language) === label &&
                                    track.mode !== 'disabled' && track.cues && track.cues.length > 0);
                                subtitles.push({id, label, selected: fastSelected ? fastSelected === label : loaded});
                                commands.set(id, () => node.click());
                            });
                            const riveMenu = riveSubtitleMenu();
                            const riveOptions = Array.from(riveMenu?.querySelectorAll('button') || []).filter(node => {
                                const label = clean(node.querySelector('span[title]')?.getAttribute('title'));
                                return label && !['Off', 'Upload Subtitle', 'Customize'].includes(label);
                            });
                            const riveOff = Array.from(riveMenu?.querySelectorAll('button') || []).find(node => node.querySelector('span[title="Off"]'));
                            riveOptions.forEach((node, index) => {
                                const id = 'sub:rive:' + index;
                                subtitles.push({id, label: clean(node.querySelector('span[title]')?.getAttribute('title')), selected: !!node.querySelector('path[d="M20 6 9 17l-5-5"]')});
                                commands.set(id, () => node.click());
                            });
                            const anixoOptions = location.origin === providers.anixo ? Array.from(document.querySelectorAll('#sub-options .menu-option')) : [];
                            const anixoOff = anixoOptions.find(node => clean(node.textContent).toLowerCase() === 'off');
                            anixoOptions.filter(node => node !== anixoOff).forEach((node, index) => {
                                const id = 'sub:anixo:' + index;
                                subtitles.push({id, label: clean(node.textContent), selected: node.classList.contains('active')});
                                commands.set(id, () => node.click());
                            });
                            // Prefer provider menu actions: Vidstack renders its own captions and
                            // changing only video.textTracks can leave its selected language stale.
                            for (const node of document.querySelectorAll('[role="menuitemradio"], [role="radio"]')) {
                                const value = node.getAttribute('value') || node.getAttribute('data-value') || '';
                                const group = node.closest('[role="radiogroup"]');
                                const groupName = (group?.getAttribute('aria-label') || '').toLowerCase();
                                const kind = value.startsWith(':subtitles-') || groupName.includes('subtitle') || groupName.includes('caption') ? 'sub' :
                                    groupName === 'audio' || groupName === 'audio tracks' || groupName === 'audio languages' ? 'audio' : '';
                                if (!kind || value === 'off') continue;
                                const id = kind + ':menu:' + value;
                                if (!value || seen.has(id)) continue;
                                seen.add(id);
                                const label = clean(node.textContent) || (kind === 'sub' ? 'Subtitle track' : 'Audio track');
                                (kind === 'sub' ? subtitles : audio).push({id, label, selected: node.getAttribute('aria-checked') === 'true'});
                                commands.set(id, () => activate(node));
                            }
                            if (!subtitles.length) nativeSubs.forEach((track, index) => {
                                const id = 'sub:native:' + index;
                                subtitles.push({id, label: clean(track.label || track.language) || 'Subtitle ' + (index + 1), selected: !vidfast && track.mode === 'showing'});
                                commands.set(id, () => {
                                    if (vidfast) throw Error('VidFast subtitle menu is not ready');
                                    nativeSubs.forEach(t => t.mode = t === track ? 'showing' : 'disabled');
                                });
                            });
                            if (!audio.length) Array.from(video?.audioTracks || []).forEach((track, index) => {
                                const id = 'audio:native:' + index;
                                audio.push({id, label: clean(track.label || track.language) || 'Audio ' + (index + 1), selected: !!track.enabled});
                                commands.set(id, () => { for (const other of video.audioTracks) other.enabled = other === track; });
                            });
                            commands.set('sub:off', () => {
                                if (vidfast) {
                                    if (!fastOff) throw Error('VidFast subtitle menu is not ready');
                                    fastOff.click(); return;
                                }
                                if (riveOff) { riveOff.click(); return; }
                                if (anixoOff) { anixoOff.click(); return; }
                                const option = Array.from(document.querySelectorAll('[role="menuitemradio"][value="off"], [role="radio"][value="off"]')).find(node =>
                                    node.parentElement?.querySelector('[value^=":subtitles-"]') || /subtitle|caption/i.test(node.closest('[role="radiogroup"]')?.getAttribute('aria-label') || ''));
                                if (option) activate(option);
                                else nativeSubs.forEach(t => t.mode = 'disabled');
                            });
                            return {subtitles, audio, ready: !!video && video.readyState > 0};
                        };
                        const reply = (error = '') => window.parent.postMessage({source: 'screening-room-tracks', ...collect(), error}, allowedParent);
                        window.addEventListener('message', event => {
                            if (event.source !== window.parent || event.origin !== allowedParent || event.data?.source !== 'screening-room-track-control') return;
                            if (event.data.action === 'getTracks') { riveSubtitleMenu(); setTimeout(() => reply(), 100); return; }
                            if (event.data.action !== 'selectTrack' || typeof event.data.id !== 'string') return;
                            collect();
                            const action = commands.get(event.data.id);
                            if (!action) { reply('That track is no longer available. Choose another track.'); return; }
                            try { action(); setTimeout(() => reply(), 100); }
                            catch (_) { reply('This server could not change the track.'); }
                        });
                        // Polling is requested only while the app's track dialog is open.
                    })();`.replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providerOrigins))
                }]
                localUrl: cineproSession.url
                onDownloadRequested: function(download) { download.cancel(); }
            }
            // This view has no WebChannel or access to the native NAS/player bridge.
            settings.localContentCanAccessFileUrls: false
            settings.fullScreenSupportEnabled: true
            // Remote controls live in the parent page. Their postMessage commands
            // do not carry user activation into the cross-origin provider frame.
            settings.playbackRequiresUserGesture: false
            onNavigationRequested: function(request) {
                const nasUrl = cineproSession.url.toString().split('/').slice(0, 3).join('/') + '/__screening-room/nas';
                if (request.isMainFrame && request.url.toString() === nasUrl) {
                    request.action = WebEngineNavigationRequest.IgnoreRequest;
                    Qt.callLater(function() { root.switchTab(false); });
                    return;
                }
                if (!cineproWeb.profile.acceptsNavigation(request.url, request.isMainFrame))
                    request.action = WebEngineNavigationRequest.IgnoreRequest;
            }
            onNewWindowRequested: function(request) { /* Keep playback in this window. */ }
            onLoadingChanged: function(info) {
                if (info.status === WebEngineView.LoadStartedStatus) loadFailed = false;
                if (info.status === WebEngineView.LoadFailedStatus) {
                    loadFailed = true;
                    pageRetry.forceActiveFocus();
                }
                if (info.status === WebEngineView.LoadSucceededStatus) forceActiveFocus();
            }
            onUrlChanged: {
                const value = url.toString();
                if (value.indexOf('/watch/') < 0 && value.indexOf('http://127.0.0.1:') === 0)
                    root.cineproBrowseUrl = value.indexOf('screeningRoom=1') >= 0 ? value : value + (value.indexOf('?') >= 0 ? '&' : '?') + 'screeningRoom=1';
            }
            onFullScreenRequested: function(request) {
                request.accept();
                root.onlineFullscreen = request.toggleOn;
                if (request.toggleOn) {
                    root.wasFullscreen = root.visibility === Window.FullScreen;
                    root.showFullScreen();
                } else if (!root.wasFullscreen) root.showNormal();
            }
            Rectangle {
                anchors.fill: parent; visible: cineproWeb.loadFailed
                color: "#edf3f7"
                Column {
                    anchors.centerIn: parent; spacing: 24
                    Text { text: "CinePro could not load"; color: "#071b51"; font.pixelSize: 28 }
                    Button {
                        id: pageRetry
                        text: "Try again"; onClicked: cineproSession.start()
                        Keys.onReturnPressed: event => { if (!event.isAutoRepeat) clicked(); event.accepted = true; }
                        Keys.onEnterPressed: event => { if (!event.isAutoRepeat) clicked(); event.accepted = true; }
                    }
                }
            }
        }
    }
    Rectangle {
        anchors.left: parent.left; anchors.right: parent.right
        anchors.top: parent.top; anchors.bottom: parent.bottom
        visible: cineproSession.active && !cineproSession.ready
        color: "#edf3f7"
        CineProLoading {
            anchors.fill: parent
            visible: cineproSession.starting
            uiScale: Math.max(1, root.uiScale)
        }
        Column {
            visible: !cineproSession.starting
            width: Math.min(parent.width - 100, 720); anchors.centerIn: parent; spacing: 24
            Text {
                width: parent.width; horizontalAlignment: Text.AlignHCenter
                text: "CinePro is unavailable"
                color: "#071b51"; font.pixelSize: 32
            }
            Text {
                width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
                text: cineproSession.error
                color: "#506888"; font.pixelSize: 20
            }
            Button {
                id: serviceRetry
                objectName: "cinepro-retry"
                anchors.horizontalCenter: parent.horizontalCenter
                text: "Try again"; visible: !cineproSession.starting
                onClicked: cineproSession.start()
                Keys.onReturnPressed: event => { if (!event.isAutoRepeat) clicked(); event.accepted = true; }
                Keys.onEnterPressed: event => { if (!event.isAutoRepeat) clicked(); event.accepted = true; }
            }
        }
    }
    PlaybackControls {
        id: playback
        width: 1920; height: 1080
        anchors.centerIn: parent
        scale: Math.min(root.width / width, root.height / height)
        player: videoBackend
        onPlayingChanged: {
            if (playing) forceActiveFocus();
            else web.forceActiveFocus();
        }
    }
}
