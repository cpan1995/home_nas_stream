// Runs in Qt's isolated script world. Only measured media state and local DOM
// option IDs cross the boundary; no stream URLs or native privileges are exposed.
(() => {
    const allowedParent = __SCREENING_ROOM_ORIGIN__;
    const providers = __SCREENING_ROOM_PROVIDERS__;
    if (window === window.top || !Object.values(providers).includes(location.origin)) return;
    let video = null, session = '', desired = 'current', options = new Map(), probing = window.name === 'screening-room-quality-probe';
    let delivered = 0, callback = 0, disposed = false, selectedAt = 0;
    const resolution = (width, height) => [2160, 1440, 1080, 720, 480, 360, 240, 144]
        .find(h => height >= h * .95 || width >= Math.round(h * 16 / 9) * .98) || Math.round(height);
    const heightFrom = text => {
        const value = String(text || '').trim();
        if (/^4k\b/i.test(value)) return 2160;
        const match = /^(144|240|360|480|720|1080|1440|2160)p\b/i.exec(value);
        return match ? Number(match[1]) : 0;
    };
    function discoverOptions(reveal = false) {
        // VidFast creates rendition rows only after opening its Quality submenu.
        // Keep this interaction inside the muted checker, except when applying
        // an explicit quality to the active video.
        if (location.origin === providers.vidfast && (probing || reveal)) {
            const label = [...document.querySelectorAll('button div')].find(n => n.childElementCount === 0 && n.textContent.trim() === 'Quality');
            if (label?.closest('button')?.textContent.includes('Playback speed')) label.parentElement?.parentElement?.click();
        }
        if (reveal || probing) {
            const toggle = [...document.querySelectorAll('button[role="menuitem"][aria-haspopup="menu"]')].find(n => /^Quality/.test(n.textContent.trim()));
            if (toggle?.getAttribute('aria-expanded') === 'false') {
                toggle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                toggle.click();
            }
        }
        options = new Map();
        // Match resolution labels only: subtitle/audio radio options must not
        // become quality controls. The map is rebuilt before every selection.
        for (const node of document.querySelectorAll('[role="menuitemradio"], [data-quality], #quality-options .menu-option, .art-selector-quality .art-selector-item, button')) {
            const height = heightFrom(node.getAttribute('data-quality') || node.getAttribute('aria-label') || node.textContent);
            if (!height || node.disabled || node.getAttribute('aria-disabled') === 'true') continue;
            if (!options.has('q:' + height)) options.set('q:' + height, { node, height });
        }
        if (location.origin === providers.vidfast) {
            const menu = [...document.querySelectorAll('button')].find(n => /^Quality/.test(n.textContent.trim()));
            for (const label of menu?.querySelectorAll('div') || []) {
                if (label.childElementCount) continue;
                const height = heightFrom(label.textContent);
                if (height) options.set('q:' + height, { node: label.parentElement, height });
            }
        }
        return [...options].map(([id, value]) => ({ id, height: value.height }));
    }
    function discover() {
        const next = document.querySelector('video');
        if (next === video) return;
        if (video && callback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
        video = next; delivered = 0; callback = 0;
        if (!video) return;
        if (probing) { video.muted = true; video.volume = 0; }
        const count = () => {
            delivered++;
            if (!disposed && video?.requestVideoFrameCallback) callback = video.requestVideoFrameCallback(count);
        };
        if (video.requestVideoFrameCallback) callback = video.requestVideoFrameCallback(count);
    }
    function choose(id) {
        discoverOptions(true);
        if (id === 'current') return true;
        const option = options.get(id);
        if (!option) return false;
        if (option.node.getAttribute('aria-checked') !== 'true' && !option.node.classList.contains('active')) {
            option.node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            option.node.click();
        }
        return true;
    }
    function snapshot() {
        discover();
        if (!session) return;
        const choices = discoverOptions();
        const width = video?.videoWidth || 0, height = video?.videoHeight || 0;
        const quality = video?.getVideoPlaybackQuality?.();
        window.parent.postMessage({ source: 'screening-room-quality', session,
            width, height, resolution: width && height ? resolution(width, height) : 0,
            time: video?.currentTime || 0, frames: Math.max(delivered, (quality ? quality.totalVideoFrames - quality.droppedVideoFrames : video?.webkitDecodedFrameCount) || 0),
            ready: video?.readyState || 0, paused: video?.paused ?? true,
            error: video?.error ? 'decode-failed' : undefined, options: choices,
        }, allowedParent);
    }
    const observer = new MutationObserver(discover);
    observer.observe(document, { childList: true, subtree: true });
    const receive = event => {
        if (event.origin !== allowedParent || event.source !== window.parent || event.data?.source !== 'screening-room-quality-control') return;
        const data = event.data;
        if (typeof data.session !== 'string' || data.session.length > 120) return;
        if (!['measure', 'probe', 'select', 'stop'].includes(data.action)) return;
        // Qt can inject before the browsing-context name is assigned. The
        // trusted parent's probe command also establishes the checker role.
        if (data.action === 'probe') probing = true;
        session = data.session; discover();
        if (data.action === 'stop') { if (probing) video?.pause(); return; }
        if (data.action === 'select' || data.action === 'probe') {
            const id = typeof data.id === 'string' ? data.id : 'current';
            const drifted = data.action === 'select' && /^q:/.test(id) && video?.readyState >= 2 && !video.paused && video.videoWidth > 0 &&
                resolution(video.videoWidth, video.videoHeight) !== Number(id.slice(2)) && Date.now() - selectedAt > 3000;
            if (id !== desired || drifted) { if (choose(id)) { desired = id; selectedAt = Date.now(); } }
        }
        if (data.action === 'probe' && probing && video) {
            video.muted = true; video.volume = 0;
            if (!video.currentSrc && location.origin === providers.vidlink) document.querySelector('button[aria-label="Play"]')?.click();
            if (video.paused) video.play().catch(() => {});
        }
        snapshot();
    };
    window.addEventListener('message', receive);
    discover();
    const timer = setInterval(snapshot, 500);
    window.addEventListener('pagehide', () => {
        disposed = true; clearInterval(timer); observer.disconnect(); window.removeEventListener('message', receive);
        if (video && callback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
        if (probing) video?.pause();
    }, { once: true });
})();
