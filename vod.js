// ─── config/vod.js ────────────────────────────────────────────────────────────
// VOD chat export tab.
//
// Fetches the full chat log from a Twitch VOD via the GQL API, then renders
// every frame to an OffscreenCanvas and encodes it to a transparent WebM file
// using the WebCodecs VideoEncoder API (Chrome 94+).
//
// The resulting .webm can be dropped on a track above footage in any NLE
// (DaVinci Resolve, Premiere, Final Cut) without needing a chroma key.
//
// Styling is read live from the YACOFO config page inputs so the exported
// video matches whatever the streamer has configured.

// ── Constants ────────────────────────────────────────────────────────────────
// Twitch's own web client ID — used by every major third-party Twitch tool
// for GQL access. Does not require an OAuth token for public VODs.
const _VOD_GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const _VOD_GQL_URL    = 'https://gql.twitch.tv/gql';
const _VOD_FPS        = 30;
const _VOD_BITRATE    = 500_000; // 500 kbps — chat on transparent bg compresses extremely well

// ── State ─────────────────────────────────────────────────────────────────────
let _vodMsgs      = [];    // [{offset, username, color, badges[], text}]
let _vodDuration  = 0;     // seconds
let _vodTitle     = '';
let _vodId        = '';
let _vodExporting = false;

// Badge images pre-loaded as HTMLImageElement, keyed by category name
const _vodBadgeImgs = {};

// Simple text-measurement cache to avoid calling measureText repeatedly
// for the same string+font during encoding
const _vodMeasureCache = {};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── VOD ID extraction ─────────────────────────────────────────────────────────
function _extractVodId(input) {
    const str = input.trim();
    const match = str.match(/\/videos\/(\d+)/);
    if (match) return match[1];
    if (/^\d+$/.test(str)) return str;
    return null;
}

// ── GQL ───────────────────────────────────────────────────────────────────────
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
            const n = edge.node;
            // Build text from fragments — emotes shown as their text code for now
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

        // Brief pause to avoid hammering the API
        await new Promise(r => setTimeout(r, 60));
    }

    // Ensure messages are sorted by offset (they should be, but guarantee it)
    messages.sort((a, b) => a.offset - b.offset);
    return messages;
}

// ── Fetch handler (called from button) ───────────────────────────────────────
async function vodFetch() {
    const input = _vodEl('vod-url')?.value?.trim();
    if (!input) { _vodStatus('Please enter a VOD URL or ID.', true); return; }

    const vodId = _extractVodId(input);
    if (!vodId) { _vodStatus('Could not parse a VOD ID from that input.', true); return; }

    const btn = _vodEl('vod-fetch-btn');
    btn.disabled = true;
    _vodEl('vod-info-section').style.display   = 'none';
    _vodEl('vod-export-section').style.display = 'none';
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
            `<strong>${escapeHTML(_vodTitle)}</strong><br>` +
            `Channel: ${escapeHTML(info.owner?.displayName || '')}` +
            (date ? `&nbsp;·&nbsp;${date}` : '') +
            `<br>Duration: ${_vodFmtDur(_vodDuration)}`;
        _vodEl('vod-info-section').style.display = 'block';

        _vodStatus('Fetching chat…');
        _vodMsgs = await _fetchVodChat(vodId, n => {
            _vodStatus(`Fetching chat… ${n.toLocaleString()} messages`);
        });

        _vodStatus(`Ready — ${_vodMsgs.length.toLocaleString()} messages loaded.`);
        _vodEl('vod-export-section').style.display = 'block';

    } catch(e) {
        _vodStatus(`Error: ${e.message}`, true);
        console.error('[VOD Fetch]', e);
    } finally {
        btn.disabled = false;
    }
}

// ── Badge preloading ──────────────────────────────────────────────────────────
// Piggybacks on preview.js's _pvBadgeUrl cache which is already populated
// by the time the user gets to the VOD tab.
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
    if (setID === 'broadcaster')   return _vodBadgeImgs.broadcaster;
    if (['moderator','lead_moderator','staff','admin','global_mod'].includes(setID))
                                   return _vodBadgeImgs.moderator;
    if (setID === 'vip')           return _vodBadgeImgs.vip;
    if (setID === 'subscriber')    return _vodBadgeImgs.subscriber;
    return _vodBadgeImgs.bits;    // custom: bits, sub-gifter, hype train, etc.
}

// ── Config reader ─────────────────────────────────────────────────────────────
function _vodCfg() {
    const pv = (id, fb) => { const el = document.getElementById(id); return el ? (el.value || fb) : fb; };
    const pn = (id, fb) => { const v = parseInt(pv(id,'')); return isNaN(v) ? fb : v; };
    const po = (id, fb) => { const el = document.getElementById(id); return el ? parseInt(el.value ?? fb) : fb; };

    const lifetime = pn('messageLifetime', 0);

    // Resolve shadow colour+opacity into a CSS rgba string
    const shHex = (pv('shadowColor','#000000')||'#000000').replace('#','');
    const shA   = po('shadowOpacity', 0) / 100;
    const shadowColor = shA > 0
        ? `rgba(${parseInt(shHex.slice(0,2)||'00',16)},${parseInt(shHex.slice(2,4)||'00',16)},${parseInt(shHex.slice(4,6)||'00',16)},${shA})`
        : null;

    return {
        nameFontSize:    pn('nameFontSize',    15),
        messageFontSize: pn('messageFontSize', 15),
        lineHeight:      parseFloat(pv('lineHeight','')) || 1.4,
        messageGap:      pn('messageGap',       8),
        // VOD always needs a lifetime — if 0 (forever) default to 30s for pacing
        lifetimeSec:     lifetime > 0 ? lifetime / 1000 : 30,
        fadeSec:         pn('fadeDuration', 1000) / 1000,
        fontFamily:      (typeof _previewFontFamily !== 'undefined' && _previewFontFamily)
                            ? `'${_previewFontFamily}', sans-serif`
                            : 'sans-serif',
        shadowColor,
        transparent:     _vodEl('vod-transparent')?.checked ?? true,
        bgColor:         pv('vod-bg-color', '#000000'),
    };
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

// Returns measured text width with caching
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

// Calculate the pixel height a single message occupies on the canvas
function _msgHeight(ctx, msg, canvasW, cfg) {
    const badgeSize  = Math.round(cfg.nameFontSize * 0.85);
    const badgeCount = (msg.badges || []).filter(b => _badgeImgForSet(b.setID)).length;
    const badgeW     = badgeCount * (badgeSize + 2);
    const pad        = 10;

    const nameFont = `bold ${cfg.nameFontSize}px ${cfg.fontFamily}`;
    const msgFont  = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const nameW    = _measure(ctx, msg.username + ': ', nameFont);

    ctx.font = msgFont;
    const words    = msg.text.split(' ');
    let lines      = 1;
    let line       = '';
    let firstLine  = true;

    for (const word of words) {
        const test  = line ? line + ' ' + word : word;
        const avail = firstLine
            ? canvasW - pad - badgeW - nameW - pad
            : canvasW - pad * 2;
        if (_measure(ctx, test, msgFont) > avail && line) {
            lines++;
            line      = word;
            firstLine = false;
        } else {
            line = test;
        }
    }

    return Math.ceil(lines * cfg.messageFontSize * cfg.lineHeight + cfg.messageGap);
}

// Draw a single message at (pad, y) with the given opacity
function _drawMsg(ctx, msg, y, opacity, canvasW, cfg) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const pad      = 10;
    const badgeSize = Math.round(cfg.nameFontSize * 0.85);
    const lineH     = cfg.messageFontSize * cfg.lineHeight;
    const nameFont  = `bold ${cfg.nameFontSize}px ${cfg.fontFamily}`;
    const msgFont   = `${cfg.messageFontSize}px ${cfg.fontFamily}`;
    const baseline  = y + cfg.nameFontSize;

    let x = pad;

    // Badges
    for (const badge of (msg.badges || [])) {
        const img = _badgeImgForSet(badge.setID);
        if (!img) continue;
        ctx.drawImage(img, x, baseline - badgeSize + 1, badgeSize, badgeSize);
        x += badgeSize + 2;
    }

    // Shadow (if configured)
    if (cfg.shadowColor) {
        ctx.shadowColor = cfg.shadowColor;
        ctx.shadowBlur  = 4;
    }

    // Username
    ctx.font      = nameFont;
    ctx.fillStyle = msg.color || '#9146FF';
    ctx.fillText(msg.username + ':', x, baseline);
    const nameW = _measure(ctx, msg.username + ': ', nameFont);

    // Message text with wrapping
    ctx.font      = msgFont;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const words   = msg.text.split(' ');
    let line      = '';
    let cx        = x + nameW;
    let cy        = baseline;
    let firstLine = true;

    for (const word of words) {
        const test  = line ? line + ' ' + word : word;
        const avail = firstLine ? canvasW - cx - pad : canvasW - pad * 2;
        if (_measure(ctx, test, msgFont) > avail && line) {
            ctx.fillText(line, cx, cy);
            cy       += lineH;
            cx        = pad;
            line      = word;
            firstLine = false;
        } else {
            line = test;
        }
    }
    if (line) ctx.fillText(line, cx, cy);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.restore();
}

// Render one complete frame at the given VOD timestamp (seconds)
function _renderFrame(ctx, timestamp, canvasW, canvasH, cfg) {
    // Background
    if (cfg.transparent) {
        ctx.clearRect(0, 0, canvasW, canvasH);
    } else {
        ctx.fillStyle = cfg.bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Collect visible messages using binary search start point
    const visible = [];
    for (let i = 0; i < _vodMsgs.length; i++) {
        const msg = _vodMsgs[i];
        if (msg.offset > timestamp) break;
        const age = timestamp - msg.offset;
        if (age > cfg.lifetimeSec) continue;
        const opacity = age > cfg.lifetimeSec - cfg.fadeSec
            ? 1 - (age - (cfg.lifetimeSec - cfg.fadeSec)) / cfg.fadeSec
            : 1;
        visible.push({ msg, opacity: Math.max(0, opacity) });
    }

    if (!visible.length) return;

    // Measure heights and find how many fit from the bottom up
    const heights = visible.map(v => _msgHeight(ctx, v.msg, canvasW, cfg));
    let totalH = 0;
    let startIdx = visible.length;
    for (let i = visible.length - 1; i >= 0; i--) {
        totalH += heights[i];
        if (totalH > canvasH) { startIdx = i + 1; break; }
        if (i === 0) startIdx = 0;
    }

    // Draw from bottom up
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
        _vodStatus('No messages loaded — fetch a VOD first.', true);
        return;
    }
    if (!window.VideoEncoder) {
        _vodStatus('WebCodecs not supported. Please use Chrome 94+ or a Chromium-based browser.', true);
        return;
    }
    if (typeof WebMMuxer === 'undefined') {
        _vodStatus('WebM muxer failed to load. Check your internet connection and reload.', true);
        return;
    }

    _vodExporting = true;
    const btn = _vodEl('vod-export-btn');
    btn.disabled = true;
    _vodEl('vod-progress-section').style.display = 'block';
    _vodProgress(0, 'Preparing…');
    _vodMeasureCache; // already declared above

    const W = Math.max(100, parseInt(_vodEl('vod-width')?.value  || '400'));
    const H = Math.max(100, parseInt(_vodEl('vod-height')?.value || '1080'));

    // Offscreen canvas for rendering (doesn't need to be in the DOM)
    const canvas = new OffscreenCanvas(W, H);
    const ctx    = canvas.getContext('2d', { alpha: true });
    const cfg    = _vodCfg();

    const totalFrames = Math.ceil(_vodDuration * _VOD_FPS);

    try {
        _vodProgress(1, 'Preloading badge images…');
        await _preloadVodBadges();

        // ── File System Access API for large files ────────────────────────────
        // Uses the browser's streaming file writer when available so memory
        // usage stays flat regardless of VOD length. Falls back to an in-memory
        // ArrayBuffer for browsers that don't support it.
        let muxerTarget, writableStream;
        if (window.showSaveFilePicker) {
            try {
                const fh = await window.showSaveFilePicker({
                    suggestedName: `yacofo-vod-${_vodId}.webm`,
                    types: [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }],
                });
                writableStream = await fh.createWritable();
                muxerTarget = new WebMMuxer.FileSystemWritableFileStreamTarget(writableStream);
            } catch {
                // User cancelled file picker or API unavailable — fall back
                muxerTarget = new WebMMuxer.ArrayBufferTarget();
            }
        } else {
            muxerTarget = new WebMMuxer.ArrayBufferTarget();
        }

        // ── Muxer ─────────────────────────────────────────────────────────────
        const muxer = new WebMMuxer.Muxer({
            target: muxerTarget,
            video: {
                codec:     'V_VP9',
                width:     W,
                height:    H,
                frameRate: _VOD_FPS,
            },
        });

        // ── Encoder ───────────────────────────────────────────────────────────
        let encodeError = null;
        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error:  (e) => { encodeError = e; },
        });

        encoder.configure({
            codec:     'vp09.00.10.08',
            width:     W,
            height:    H,
            bitrate:   _VOD_BITRATE,
            framerate: _VOD_FPS,
            alpha:     'keep',
        });

        // ── Frame loop ────────────────────────────────────────────────────────
        const exportStart = performance.now();
        // Clear measure cache for this run (config may have changed since last export)
        for (const k in _vodMeasureCache) delete _vodMeasureCache[k];

        for (let f = 0; f < totalFrames; f++) {
            if (encodeError) throw encodeError;

            const timestamp = f / _VOD_FPS;
            _renderFrame(ctx, timestamp, W, H, cfg);

            const frame = new VideoFrame(canvas, {
                timestamp: Math.round(f * (1_000_000 / _VOD_FPS)),
                duration:  Math.round(1_000_000 / _VOD_FPS),
            });
            encoder.encode(frame, { keyFrame: f % (_VOD_FPS * 2) === 0 });
            frame.close();

            // Yield to browser every 30 frames to keep UI responsive
            // and update progress
            if (f % 30 === 0) {
                const pct      = (f / totalFrames) * 100;
                const elapsed  = (performance.now() - exportStart) / 1000;
                const speed    = elapsed > 0 ? (timestamp / elapsed).toFixed(1) : '…';
                _vodProgress(pct,
                    `Encoding ${_vodFmtDur(timestamp)} / ${_vodFmtDur(_vodDuration)} ` +
                    `(${Math.round(pct)}% · ${speed}× realtime)`
                );
                await new Promise(r => setTimeout(r, 0));
            }
        }

        _vodProgress(97, 'Finalising…');
        await encoder.flush();
        muxer.finalize();

        // ── Download ──────────────────────────────────────────────────────────
        if (writableStream) {
            // FileSystemWritableFileStreamTarget writes directly — just close it
            await writableStream.close();
            _vodProgress(100, 'Saved to file.');
            _vodStatus('Export complete — file saved via browser dialog.');
        } else {
            // ArrayBufferTarget — offer as browser download
            const { buffer } = muxerTarget;
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `yacofo-vod-${_vodId}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            _vodProgress(100, `Done — ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
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

// Toggle background color picker visibility
function vodTransparentChange() {
    const transparent = _vodEl('vod-transparent')?.checked;
    const row = _vodEl('vod-bg-row');
    if (row) row.style.display = transparent ? 'none' : 'flex';
}