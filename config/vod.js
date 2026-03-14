// ─── config/vod.js ────────────────────────────────────────────────────────────
// VOD chat export tab.
//
// Fetches the full chat log from a Twitch VOD via the GQL API, then renders
// every frame to an OffscreenCanvas and encodes it to a transparent WebM file
// using the Mediabunny library (https://mediabunny.dev).
//
// The resulting .webm can be dropped on a track above footage in any NLE
// (DaVinci Resolve, Premiere, Final Cut) without needing a chroma key.
//
// Styling is read live from the YACOFO config page inputs so the exported
// video matches whatever the streamer has configured.

const _VOD_GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const _VOD_GQL_URL    = 'https://gql.twitch.tv/gql';
const _VOD_FPS        = 30;
const _VOD_BITRATE    = 500_000;

// escapeHTML is defined in src/utils.js which is only loaded by overlay.html.
// Redeclare it here for the config page context.
function _vodEscape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Mediabunny lazy loader ────────────────────────────────────────────────────
// Only loaded when the user actually clicks Export, so a missing file never
// prevents vodFetch or any other function from being defined.
let _mediabunnyLoading = null;
function _loadMediabunny() {
    if (typeof Mediabunny !== 'undefined') return Promise.resolve();
    if (_mediabunnyLoading) return _mediabunnyLoading;
    _mediabunnyLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'mediabunny.cjs';
        s.onload  = resolve;
        s.onerror = () => reject(new Error(
            'Could not load mediabunny.cjs — download it from ' +
            'https://github.com/Vanilagy/mediabunny/releases and add it to your repo root.'
        ));
        document.head.appendChild(s);
    });
    return _mediabunnyLoading;
}

let _vodMsgs      = [];
let _vodDuration  = 0;
let _vodTitle     = '';
let _vodId        = '';
let _vodExporting = false;

const _vodBadgeImgs   = {};
const _vodMeasureCache = {};

function _vodEl(id) { return document.getElementById(id); }

function _vodStatus(msg, isError = false) {
    const el = _vodEl('vod-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#ff6b6b' : 'rgba(255,255,255,0.65)';
}

function _vodProgress(pct, label) {
    const fill = _vodEl('vod-progress-fill');
    const lbl  = _vodEl('vod-progress-label');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (lbl)  lbl.textContent  = label;
}

function _vodFmtDur(seconds) {
    return new Date(seconds * 1000).toISOString().slice(11, 19);
}

function _extractVodId(input) {
    const str = input.trim();
    const match = str.match(/\/videos\/(\d+)/);
    if (match) return match[1];
    if (/^\d+$/.test(str)) return str;
    return null;
}


async function _fetchIntegrityToken() {
    if (_vodIntegrityToken && Date.now() < _vodIntegrityExpiry) return _vodIntegrityToken;

    const token    = localStorage.getItem('twitch_access_token') || '';
    const deviceId = _getDeviceId();

    const headers = {
        'Content-Type': 'application/json',
        'Client-Id':    _VOD_GQL_CLIENT,
        'X-Device-ID':  deviceId,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch('https://gql.twitch.tv/integrity', { method: 'POST', headers });
        if (!res.ok) throw new Error(`Integrity ${res.status}`);
        const data = await res.json();
        _vodIntegrityToken  = data.token;
        // Expire 30s before the actual expiry to avoid edge cases
        _vodIntegrityExpiry = Date.now() + (data.expiration * 1000) - 30_000;
        return _vodIntegrityToken;
    } catch(e) {
        console.warn('[VOD] Could not fetch integrity token:', e.message);
        return null;
    }
}

async function _fetchVodInfo(videoId) {
    const res = await fetch(_VOD_GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Id': _VOD_GQL_CLIENT },
        body: JSON.stringify({ query: `{
            video(id: "${videoId}") {
                title lengthSeconds
                owner { displayName }
                createdAt
            }
        }` }),
    });
    if (!res.ok) throw new Error(`GQL ${res.status}`);
    const json = await res.json();
    return json.data?.video || null;
}

async function _fetchVodChat(videoId, onProgress) {
    // GQL offset-based pagination — each request uses contentOffsetSeconds
    // rather than a cursor, which avoids Twitch's integrity check that blocks
    // cursor-based requests from browser origins.
    // We advance the offset to (lastMessageOffset + 1) after each page.
    const token = localStorage.getItem('twitch_access_token') || '';
    const headers = { 'Content-Type': 'application/json', 'Client-Id': _VOD_GQL_CLIENT };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const QUERY = [{
        operationName: 'VideoCommentsByOffsetOrCursor',
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a',
            },
        },
    }];

    const messages = [];
    const seen     = new Set(); // deduplicate by comment ID across overlapping pages
    let offsetSeconds = 0;

    while (true) {
        const body = JSON.stringify(QUERY.map(q => ({
            ...q,
            variables: { videoID: videoId, contentOffsetSeconds: offsetSeconds },
        })));

        const res = await fetch(_VOD_GQL_URL, { method: 'POST', headers, body });
        if (!res.ok) throw new Error(`GQL ${res.status}`);
        const json = await res.json();
        const data = Array.isArray(json) ? json[0] : json;
        const edges = data?.data?.video?.comments?.edges;
        if (!edges || edges.length === 0) break;

        let lastOffset = offsetSeconds;
        let newOnThisPage = 0;

        for (const edge of edges) {
            const n    = edge.node;
            const id   = n.id;
            if (seen.has(id)) continue;
            seen.add(id);

            const text = (n.message?.fragments || []).map(f => f.text).join('');
            if (!text.trim()) continue;

            lastOffset = n.contentOffsetSeconds;
            newOnThisPage++;
            messages.push({
                offset:   n.contentOffsetSeconds,
                username: n.commenter?.displayName || n.commenter?.login || 'unknown',
                color:    n.message?.userColor || '#9146FF',
                badges:   n.message?.userBadges || [],
                text,
            });
        }

        onProgress(messages.length);

        // If no new messages this page or we've passed the VOD end, we're done
        if (newOnThisPage === 0) break;

        // Advance to 1 second after the last message to get the next batch
        // (offset requests return comments at-or-after the given second)
        offsetSeconds = lastOffset + 1;
        await new Promise(r => setTimeout(r, 60));
    }

    messages.sort((a, b) => a.offset - b.offset);
    return messages;
}

async function vodFetch() {
    const input = _vodEl('vod-url')?.value?.trim();
    if (!input) { _vodStatus('Please enter a VOD URL or ID.', true); return; }

    const vodId = _extractVodId(input);
    if (!vodId) { _vodStatus('Could not parse a VOD ID from that input.', true); return; }

    const btn = _vodEl('vod-fetch-btn');
    btn.disabled = true;
    _vodEl('vod-info-section').style.display    = 'none';
    _vodEl('vod-export-section').style.display  = 'none';
    _vodEl('vod-progress-section').style.display = 'none';
    _vodMsgs = [];

    try {
        _vodStatus('Fetching VOD info…');
        const info = await _fetchVodInfo(vodId);
        if (!info) { _vodStatus('VOD not found or is private.', true); return; }

        _vodId       = vodId;
        _vodTitle    = info.title || 'Untitled';
        _vodDuration = info.lengthSeconds || 0;

        const date = info.createdAt ? new Date(info.createdAt).toLocaleDateString() : '';
        _vodEl('vod-info-text').innerHTML =
            `<strong>${_vodEscape(_vodTitle)}</strong><br>` +
            `Channel: ${_vodEscape(info.owner?.displayName || '')}` +
            (date ? `&nbsp;&middot;&nbsp;${date}` : '') +
            `<br>Duration: ${_vodFmtDur(_vodDuration)}`;
        _vodEl('vod-info-section').style.display = 'block';

        _vodStatus('Fetching chat\u2026');
        _vodMsgs = await _fetchVodChat(vodId, n => {
            _vodStatus(`Fetching chat\u2026 ${n.toLocaleString()} messages`);
        });

        _vodStatus(`Ready \u2014 ${_vodMsgs.length.toLocaleString()} messages loaded.`);
        _vodEl('vod-export-section').style.display = 'block';

    } catch(e) {
        _vodStatus(`Error: ${e.message}`, true);
        console.error('[VOD Fetch]', e);
    } finally {
        btn.disabled = false;
    }
}

// ── Badge preloading ──────────────────────────────────────────────────────────
// ── Asset loading helpers ────────────────────────────────────────────────────
function _loadImg(url) {
    return new Promise(resolve => {
        if (!url) { resolve(null); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

async function _preloadVodBadges() {
    const token   = localStorage.getItem('twitch_access_token') || '';
    const headers = { 'Authorization': `Bearer ${token}`, 'Client-Id': 'ti9ahr6lkym6anpij3d4f2cyjhij18' };
    const badgeUrls = {};

    try {
        const res = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        if (res.ok) {
            for (const set of (await res.json()).data || [])
                for (const ver of set.versions || [])
                    badgeUrls[`${set.set_id}/${ver.id}`] = ver.image_url_4x;
        }
    } catch(e) {}

    if (_vodBroadcasterId) {
        try {
            const res = await fetch(
                `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${_vodBroadcasterId}`, { headers });
            if (res.ok)
                for (const set of (await res.json()).data || [])
                    for (const ver of set.versions || [])
                        badgeUrls[`${set.set_id}/${ver.id}`] = ver.image_url_4x;
        } catch(e) {}
    }

    await Promise.all(Object.entries(badgeUrls).map(async ([key, url]) => {
        const img = await _loadImg(url);
        if (img) _vodBadgeMap[key] = img;
    }));
}

async function _preloadVodEmotes() {
    const ids = new Set();
    for (const msg of _vodMsgs)
        for (const frag of (msg.fragments || []))
            if (frag.emote?.emoteID) ids.add(frag.emote.emoteID);

    await Promise.all([...ids].map(async id => {
        const img = await _loadImg(
            `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`);
        if (img) _vodEmoteMap[id] = img;
    }));
}

function _badgeImgForSet(setID, version) {
    return _vodBadgeMap[`${setID}/${version}`] || _vodBadgeMap[`${setID}/0`] || null;
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
function _measure(ctx, text, font) {
    const key = `${font}|${text}`;
    if (_vodMeasureCache[key] === undefined) {
        const prev = ctx.font; ctx.font = font;
        _vodMeasureCache[key] = ctx.measureText(text).width;
        ctx.font = prev;
    }
    return _vodMeasureCache[key];
}

// Build flat token list from fragments: {type:'text'|'emote', text?, img?, w, h?}
function _tokenise(ctx, msg, cfg) {
    const msgFont = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const emoteH  = Math.round(cfg.messageFontSize * 1.5);
    const tokens  = [];
    const frags   = msg.fragments?.length ? msg.fragments : [{ text: msg.text }];

    for (const frag of frags) {
        const eImg = frag.emote?.emoteID ? _vodEmoteMap[frag.emote.emoteID] : null;
        if (eImg) {
            const w = eImg.naturalWidth > 0
                ? Math.round(eImg.naturalWidth * emoteH / eImg.naturalHeight) : emoteH;
            tokens.push({ type: 'emote', img: eImg, w, h: emoteH });
        } else {
            for (const part of (frag.text || '').split(/(\s+)/)) {
                if (!part) continue;
                tokens.push({ type: 'text', text: part, w: _measure(ctx, part, msgFont) });
            }
        }
    }
    return tokens;
}

// Wrap tokens into lines. startX = pixels already used on the first line.
function _wrapTokens(tokens, startX, canvasW, cfg) {
    const pad = 10;
    const maxW = canvasW - pad * 2;
    const lines = [];
    let cur = [], lineW = startX;

    for (const tok of tokens) {
        const isSpace = tok.type === 'text' && /^\s+$/.test(tok.text);
        if (isSpace && cur.length === 0) continue;
        if (lineW + tok.w > maxW && cur.length > 0 && !isSpace) {
            while (cur.length && cur[cur.length-1].type === 'text' && /^\s+$/.test(cur[cur.length-1].text)) cur.pop();
            lines.push(cur); cur = [tok]; lineW = pad + tok.w;
        } else {
            cur.push(tok); lineW += tok.w;
        }
    }
    if (cur.length) lines.push(cur);
    return lines.length ? lines : [[]];
}

function _msgHeight(ctx, msg, canvasW, cfg) {
    const badgeSize  = Math.round(cfg.nameFontSize * 0.85);
    const badgeCount = (msg.badges || []).filter(b => _badgeImgForSet(b.setID, b.version)).length;
    const badgeW     = badgeCount * (badgeSize + 2);
    const pad        = 10;
    const nameW      = _measure(ctx, msg.username + ': ', `bold ${cfg.nameFontSize}px ${cfg.fontFamily}`);
    ctx.font = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const lines = _wrapTokens(_tokenise(ctx, msg, cfg), pad + badgeW + nameW, canvasW, cfg);
    return Math.ceil(lines.length * cfg.messageFontSize * cfg.lineHeight + cfg.messageGap);
}

function _drawMsg(ctx, msg, y, opacity, canvasW, cfg) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const pad       = 10;
    const badgeSize = Math.round(cfg.nameFontSize * 0.85);
    const lineH     = cfg.messageFontSize * cfg.lineHeight;
    const nameFont  = `bold ${cfg.nameFontSize}px ${cfg.fontFamily}`;
    const emoteH    = Math.round(cfg.messageFontSize * 1.5);
    const baseline  = y + cfg.nameFontSize;
    let x = pad;

    for (const badge of (msg.badges || [])) {
        const img = _badgeImgForSet(badge.setID, badge.version);
        if (!img) continue;
        ctx.drawImage(img, x, baseline - badgeSize + 1, badgeSize, badgeSize);
        x += badgeSize + 2;
    }

    if (cfg.shadowColor) { ctx.shadowColor = cfg.shadowColor; ctx.shadowBlur = 4; }

    ctx.font = nameFont;
    ctx.fillStyle = msg.color || '#9146FF';
    ctx.fillText(msg.username + ':', x, baseline);
    const nameW = _measure(ctx, msg.username + ': ', nameFont);

    ctx.font = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const tokens = _tokenise(ctx, msg, cfg);
    const lines  = _wrapTokens(tokens, x + nameW - pad, canvasW, cfg);

    let cx = x + nameW, cy = baseline;
    for (let li = 0; li < lines.length; li++) {
        if (li > 0) { cy += lineH; cx = pad; }
        for (const tok of lines[li]) {
            if (tok.type === 'emote') {
                ctx.drawImage(tok.img, cx, cy - emoteH + 2, tok.w, tok.h);
                cx += tok.w;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.88)';
                ctx.fillText(tok.text, cx, cy);
                cx += tok.w;
            }
        }
    }

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.restore();
}

function _renderFrame(ctx, timestamp, canvasW, canvasH, cfg) {
    if (cfg.transparent) {
        ctx.clearRect(0, 0, canvasW, canvasH);
    } else {
        ctx.fillStyle = cfg.bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    const visible = [];
    for (let i = 0; i < _vodMsgs.length; i++) {
        const msg = _vodMsgs[i];
        if (msg.offset > timestamp) break;
        const age = timestamp - msg.offset;
        if (age > cfg.lifetimeSec) continue;
        const opacity = age > cfg.lifetimeSec - cfg.fadeSec
            ? 1 - (age - (cfg.lifetimeSec - cfg.fadeSec)) / cfg.fadeSec : 1;
        visible.push({ msg, opacity: Math.max(0, opacity) });
    }
    if (!visible.length) return;

    const heights = visible.map(v => _msgHeight(ctx, v.msg, canvasW, cfg));
    let totalH = 0, startIdx = visible.length;
    for (let i = visible.length - 1; i >= 0; i--) {
        totalH += heights[i];
        if (totalH > canvasH) { startIdx = i + 1; break; }
        if (i === 0) startIdx = 0;
    }

    let y = canvasH;
    for (let i = visible.length - 1; i >= startIdx; i--) {
        y -= heights[i];
        _drawMsg(ctx, visible[i].msg, y, visible[i].opacity, canvasW, cfg);
    }
}

// ── Export pipeline ───────────────────────────────────────────────────────────
async function vodExport() {
    if (_vodExporting) return;

    if (!_vodMsgs.length) {
        _vodStatus('No messages loaded \u2014 fetch a VOD first.', true); return;
    }

    _vodExporting = true;
    const btn = _vodEl('vod-export-btn');
    btn.disabled = true;
    _vodEl('vod-progress-section').style.display = 'block';
    _vodProgress(0, 'Preparing\u2026');

    const W = Math.max(100, parseInt(_vodEl('vod-width')?.value  || '400'));
    const H = Math.max(100, parseInt(_vodEl('vod-height')?.value || '1080'));

    const canvas = new OffscreenCanvas(W, H);
    const ctx    = canvas.getContext('2d', { alpha: true });
    const cfg    = _vodCfg();

    const totalFrames   = Math.ceil(_vodDuration * _VOD_FPS);
    const frameDuration = 1 / _VOD_FPS;

    try {
        _vodProgress(1, 'Loading Mediabunny\u2026');
        await _loadMediabunny();

        const { Output, WebMOutputFormat, BufferTarget, StreamTarget, CanvasSource } = Mediabunny;

        _vodProgress(2, 'Preloading badges and emotes\u2026');
        await _preloadVodBadges();
        await _preloadVodEmotes();

        // Prefer streaming to disk so memory stays flat on long VODs.
        // Falls back to in-memory buffer when File System Access API is unavailable.
        let target, writableStream;
        if (window.showSaveFilePicker) {
            try {
                const fh = await window.showSaveFilePicker({
                    suggestedName: `yacofo-vod-${_vodId}.webm`,
                    types: [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }],
                });
                writableStream = await fh.createWritable();
                target = new StreamTarget(writableStream, { chunked: true });
            } catch { target = new BufferTarget(); }
        } else {
            target = new BufferTarget();
        }

        const output = new Output({
            format: new WebMOutputFormat(),
            target,
        });

        // CanvasSource reads the OffscreenCanvas state on each source.add() call.
        // alpha: 'keep' preserves the transparent channel in the VP9 stream.
        const source = new CanvasSource(canvas, {
            codec:   'vp9',
            bitrate: _VOD_BITRATE,
            alpha:   'keep',
        });
        output.addVideoTrack(source);
        await output.start();

        const exportStart = performance.now();
        for (const k in _vodMeasureCache) delete _vodMeasureCache[k];
        _vodEntryDisp  = 0;
        _vodPrevMsgIds = new Set();

        for (let f = 0; f < totalFrames; f++) {
            const timestamp = f * frameDuration;
            _renderFrame(ctx, timestamp, W, H, cfg);

            // source.add(timestamp, duration) — both in seconds.
            await source.add(timestamp, frameDuration);

            if (f % 30 === 0) {
                const pct     = (f / totalFrames) * 100;
                const elapsed = (performance.now() - exportStart) / 1000;
                const speed   = elapsed > 0 ? (timestamp / elapsed).toFixed(1) : '\u2026';
                _vodProgress(pct,
                    `Encoding ${_vodFmtDur(timestamp)} / ${_vodFmtDur(_vodDuration)} ` +
                    `(${Math.round(pct)}% \u00b7 ${speed}\u00d7 realtime)`
                );
                await new Promise(r => setTimeout(r, 0));
            }
        }

        _vodProgress(97, 'Finalising\u2026');
        await output.finalize();

        if (writableStream) {
            _vodProgress(100, 'Saved to file.');
            _vodStatus('Export complete \u2014 file saved via browser dialog.');
        } else {
            const buffer = target.buffer;
            const blob   = new Blob([buffer], { type: 'video/webm' });
            const url    = URL.createObjectURL(blob);
            const a      = document.createElement('a');
            a.href       = url;
            a.download   = `yacofo-vod-${_vodId}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            _vodProgress(100, `Done \u2014 ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
            _vodStatus('Export complete.');
        }

    } catch(e) {
        _vodStatus(`Export failed: ${e.message}`, true);
        _vodProgress(0, '');
        console.error('[VOD Export]', e);
    } finally {
        _vodExporting = false;
        btn.disabled  = false;
    }
}

function vodTransparentChange() {
    const transparent = _vodEl('vod-transparent')?.checked;
    const row = _vodEl('vod-bg-row');
    if (row) row.style.display = transparent ? 'none' : 'flex';
}