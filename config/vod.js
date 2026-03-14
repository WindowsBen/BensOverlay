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

async function _gql(query, variables = {}) {
    const res = await fetch(_VOD_GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Id': _VOD_GQL_CLIENT },
        body:    JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GQL ${res.status}`);
    return res.json();
}

async function _fetchVodInfo(videoId) {
    const data = await _gql(`query {
        video(id: "${videoId}") {
            title lengthSeconds
            owner { displayName }
            createdAt
        }
    }`);
    return data.data?.video || null;
}

async function _fetchVodChat(videoId, onProgress) {
    const QUERY = `
    query VodChat($videoID: ID!, $cursor: String) {
        video(id: $videoID) {
            comments(after: $cursor, first: 100) {
                edges {
                    cursor
                    node {
                        contentOffsetSeconds
                        message {
                            fragments { text emote { emoteID } }
                            userColor
                        }
                        commenter { displayName login }
                        userBadges { setID version }
                    }
                }
                pageInfo { hasNextPage }
            }
        }
    }`;

    const messages = [];
    let cursor = null;

    while (true) {
        const data = await _gql(QUERY, { videoID: videoId, cursor });
        const comments = data.data?.video?.comments;
        if (!comments) throw new Error('No comment data returned');

        for (const edge of comments.edges || []) {
            const n    = edge.node;
            const text = (n.message?.fragments || []).map(f => f.text).join('');
            if (!text.trim()) continue;
            messages.push({
                offset:   n.contentOffsetSeconds,
                username: n.commenter?.displayName || n.commenter?.login || 'unknown',
                color:    n.message?.userColor || '#9146FF',
                badges:   n.userBadges || [],
                text,
            });
            cursor = edge.cursor;
        }

        onProgress(messages.length);
        if (!comments.pageInfo?.hasNextPage) break;
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
async function _preloadVodBadges() {
    if (typeof _pvBadgeUrl === 'undefined') return;
    await Promise.all(Object.entries(_pvBadgeUrl).map(([key, url]) => {
        if (!url || _vodBadgeImgs[key]) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload  = () => { _vodBadgeImgs[key] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = url;
        });
    }));
}

function _badgeImgForSet(setID) {
    if (setID === 'broadcaster') return _vodBadgeImgs.broadcaster;
    if (['moderator','lead_moderator','staff','admin','global_mod'].includes(setID))
        return _vodBadgeImgs.moderator;
    if (setID === 'vip')         return _vodBadgeImgs.vip;
    if (setID === 'subscriber')  return _vodBadgeImgs.subscriber;
    return _vodBadgeImgs.bits;
}

// ── Config reader ─────────────────────────────────────────────────────────────
function _vodCfg() {
    const pv = (id, fb) => { const el = document.getElementById(id); return el ? (el.value || fb) : fb; };
    const pn = (id, fb) => { const v = parseInt(pv(id, '')); return isNaN(v) ? fb : v; };
    const po = (id, fb) => { const el = document.getElementById(id); return el ? parseInt(el.value ?? fb) : fb; };

    const lifetime = pn('messageLifetime', 0);
    const shHex = (pv('shadowColor', '#000000') || '#000000').replace('#', '');
    const shA   = po('shadowOpacity', 0) / 100;
    const shadowColor = shA > 0
        ? `rgba(${parseInt(shHex.slice(0,2)||'00',16)},${parseInt(shHex.slice(2,4)||'00',16)},${parseInt(shHex.slice(4,6)||'00',16)},${shA})`
        : null;

    return {
        nameFontSize:    pn('nameFontSize',    15),
        messageFontSize: pn('messageFontSize', 15),
        lineHeight:      parseFloat(pv('lineHeight', '')) || 1.4,
        messageGap:      pn('messageGap',       8),
        lifetimeSec:     lifetime > 0 ? lifetime / 1000 : 30,
        fadeSec:         pn('fadeDuration', 1000) / 1000,
        fontFamily:      (typeof _previewFontFamily !== 'undefined' && _previewFontFamily)
                            ? `'${_previewFontFamily}', sans-serif` : 'sans-serif',
        shadowColor,
        transparent: _vodEl('vod-transparent')?.checked ?? true,
        bgColor:     pv('vod-bg-color', '#000000'),
    };
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
function _measure(ctx, text, font) {
    const key = `${font}|${text}`;
    if (_vodMeasureCache[key] === undefined) {
        const prev = ctx.font;
        ctx.font = font;
        _vodMeasureCache[key] = ctx.measureText(text).width;
        ctx.font = prev;
    }
    return _vodMeasureCache[key];
}

function _msgHeight(ctx, msg, canvasW, cfg) {
    const badgeSize  = Math.round(cfg.nameFontSize * 0.85);
    const badgeCount = (msg.badges || []).filter(b => _badgeImgForSet(b.setID)).length;
    const badgeW     = badgeCount * (badgeSize + 2);
    const pad        = 10;
    const nameFont   = `bold ${cfg.nameFontSize}px ${cfg.fontFamily}`;
    const msgFont    = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const nameW      = _measure(ctx, msg.username + ': ', nameFont);
    const words      = msg.text.split(' ');
    let lines = 1, line = '', firstLine = true;

    for (const word of words) {
        const test  = line ? line + ' ' + word : word;
        const avail = firstLine ? canvasW - pad - badgeW - nameW - pad : canvasW - pad * 2;
        if (_measure(ctx, test, msgFont) > avail && line) {
            lines++; line = word; firstLine = false;
        } else { line = test; }
    }
    return Math.ceil(lines * cfg.messageFontSize * cfg.lineHeight + cfg.messageGap);
}

function _drawMsg(ctx, msg, y, opacity, canvasW, cfg) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const pad       = 10;
    const badgeSize = Math.round(cfg.nameFontSize * 0.85);
    const lineH     = cfg.messageFontSize * cfg.lineHeight;
    const nameFont  = `bold ${cfg.nameFontSize}px ${cfg.fontFamily}`;
    const msgFont   = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const baseline  = y + cfg.nameFontSize;
    let x = pad;

    for (const badge of (msg.badges || [])) {
        const img = _badgeImgForSet(badge.setID);
        if (!img) continue;
        ctx.drawImage(img, x, baseline - badgeSize + 1, badgeSize, badgeSize);
        x += badgeSize + 2;
    }

    if (cfg.shadowColor) { ctx.shadowColor = cfg.shadowColor; ctx.shadowBlur = 4; }

    ctx.font = nameFont;
    ctx.fillStyle = msg.color || '#9146FF';
    ctx.fillText(msg.username + ':', x, baseline);
    const nameW = _measure(ctx, msg.username + ': ', nameFont);

    ctx.font = msgFont;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const words = msg.text.split(' ');
    let line = '', cx = x + nameW, cy = baseline, firstLine = true;

    for (const word of words) {
        const test  = line ? line + ' ' + word : word;
        const avail = firstLine ? canvasW - cx - pad : canvasW - pad * 2;
        if (_measure(ctx, test, msgFont) > avail && line) {
            ctx.fillText(line, cx, cy); cy += lineH; cx = pad; line = word; firstLine = false;
        } else { line = test; }
    }
    if (line) ctx.fillText(line, cx, cy);

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

    const { Output, WebMOutputFormat, BufferTarget, StreamTarget, CanvasSource } = Mediabunny;

    try {
        _vodProgress(1, 'Loading Mediabunny\u2026');
        await _loadMediabunny();

        _vodProgress(2, 'Preloading badge images\u2026');
        await _preloadVodBadges();

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