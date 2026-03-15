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
const _VOD_BITRATE    = 4_000_000; // 4 Mbps — sufficient for crisp text rendering

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

let _vodMsgs          = [];
let _vodDuration      = 0;
let _vodTitle         = '';
let _vodId            = '';
let _vodExporting     = false;
let _vodBroadcasterId = null;

const _vodBadgeMap     = {};  // "setID/version" -> HTMLImageElement
const _vodEmoteMap     = {};  // Twitch emoteID -> HTMLImageElement
const _vodThirdEmoteMap = {}; // emote text code -> HTMLImageElement (BTTV/FFZ/7TV)
const _vodMeasureCache = {};

let _vodEntryDisp  = 0;       // smooth scroll: accumulated entry displacement in px
let _vodPrevMsgIds = new Set(); // IDs visible in previous frame

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
                title lengthSeconds createdAt
                owner { displayName }
                creator { id }
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

            const frags = n.message?.fragments || [];
            const text  = frags.map(f => f.text).join('');
            if (!text.trim()) continue;

            lastOffset = n.contentOffsetSeconds;
            newOnThisPage++;
            messages.push({
                id:        n.id,
                offset:    n.contentOffsetSeconds,
                username:  n.commenter?.displayName || n.commenter?.login || 'unknown',
                color:     n.message?.userColor || '#9146FF',
                badges:    n.message?.userBadges || [],
                fragments: frags,
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

        _vodId            = vodId;
        _vodTitle         = info.title || 'Untitled';
        _vodDuration      = info.lengthSeconds || 0;
        _vodBroadcasterId = info.creator?.id || null;

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
// Load an image via fetch+blob so it's always canvas-safe.
// crossOrigin='anonymous' on <img> only works if the server sends CORS headers.
// fetch() will silently fail for non-CORS CDNs (BTTV, FFZ) — those emotes/badges
// won't appear in exports, but they also won't taint the canvas or spam errors.
async function _loadImg(url) {
    if (!url) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        return await new Promise(resolve => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
            img.src = objectUrl;
        });
    } catch {
        return null; // CORS blocked or network error — skip silently
    }
}

async function _preloadVodBadges() {
    const token   = localStorage.getItem('twitch_access_token') || '';
    const headers = { 'Authorization': `Bearer ${token}`, 'Client-Id': 'ti9ahr6lkym6anpij3d4f2cyjhij18' };
    const badgeUrls = {};

    try {
        const res = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        if (res.ok)
            for (const set of (await res.json()).data || [])
                for (const ver of set.versions || [])
                    badgeUrls[`${set.set_id}/${ver.id}`] = ver.image_url_4x;
    } catch(e) {}

    // Prefer _vodBroadcasterId; fall back to resolving from channel name in VOD info text
    let broadcasterId = _vodBroadcasterId;
    if (!broadcasterId) {
        try {
            const login = (document.getElementById('vod-info-text')?.textContent
                ?.match(/Channel:\s*(\S+)/)?.[1] || '').toLowerCase();
            if (login) {
                const r = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, { headers });
                if (r.ok) broadcasterId = (await r.json()).data?.[0]?.id || null;
            }
        } catch(e) {}
    }

    if (broadcasterId) {
        try {
            const res = await fetch(
                `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`, { headers });
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

async function _preloadThirdPartyEmotes() {
    // Resolve channel login from VOD info panel
    const login = (document.getElementById('vod-info-text')?.textContent
        ?.match(/Channel:\s*(\S+)/)?.[1] || '').toLowerCase();
    if (!login) return;

    let userId = _vodBroadcasterId;
    if (!userId) {
        try {
            const token   = localStorage.getItem('twitch_access_token') || '';
            const headers = { 'Authorization': `Bearer ${token}`, 'Client-Id': 'ti9ahr6lkym6anpij3d4f2cyjhij18' };
            const r = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, { headers });
            if (r.ok) userId = (await r.json()).data?.[0]?.id || null;
        } catch(e) {}
    }
    if (!userId) return;

    // BTTV global + channel
    try {
        const [gr, cr] = await Promise.all([
            fetch('https://api.betterttv.net/3/cached/emotes/global'),
            fetch(`https://api.betterttv.net/3/cached/users/twitch/${userId}`),
        ]);
        if (gr.ok)
            for (const e of await gr.json())
                _vodThirdEmoteMap[e.code] = `https://cdn.betterttv.net/emote/${e.id}/2x`;
        if (cr.ok) {
            const d = await cr.json();
            for (const e of [...(d.channelEmotes||[]), ...(d.sharedEmotes||[])])
                _vodThirdEmoteMap[e.code] = `https://cdn.betterttv.net/emote/${e.id}/2x`;
        }
    } catch(e) {}

    // FFZ global + channel
    try {
        const [gr, cr] = await Promise.all([
            fetch('https://api.frankerfacez.com/v1/set/global'),
            fetch(`https://api.frankerfacez.com/v1/room/id/${userId}`),
        ]);
        const ffzUrl = e => e.urls?.['4'] || e.urls?.['2'] || e.urls?.['1'];
        if (gr.ok)
            for (const set of Object.values((await gr.json()).sets || {}))
                for (const e of set.emoticons || [])
                    if (ffzUrl(e)) _vodThirdEmoteMap[e.name] = ffzUrl(e);
        if (cr.ok)
            for (const set of Object.values((await cr.json()).sets || {}))
                for (const e of set.emoticons || [])
                    if (ffzUrl(e)) _vodThirdEmoteMap[e.name] = ffzUrl(e);
    } catch(e) {}

    // 7TV global + channel
    try {
        const [gr, cr] = await Promise.all([
            fetch('https://7tv.io/v3/emote-sets/global'),
            fetch(`https://7tv.io/v3/users/twitch/${userId}`),
        ]);
        if (gr.ok)
            for (const e of (await gr.json()).emotes || [])
                _vodThirdEmoteMap[e.name] = `https://cdn.7tv.app/emote/${e.id}/2x.webp`;
        if (cr.ok)
            for (const e of (await cr.json()).emote_set?.emotes || [])
                _vodThirdEmoteMap[e.name] = `https://cdn.7tv.app/emote/${e.id}/2x.webp`;
    } catch(e) {}

    // Pre-load all images in parallel, replacing URL strings with HTMLImageElement
    await Promise.all(Object.entries(_vodThirdEmoteMap).map(async ([code, url]) => {
        if (typeof url !== 'string') return; // already loaded
        const img = await _loadImg(url);
        if (img) _vodThirdEmoteMap[code] = img;
        else delete _vodThirdEmoteMap[code];
    }));


// ── 7TV per-user cosmetics ────────────────────────────────────────────────────
// Maps Twitch login (lowercase) → { paint, badgeUrl }
const _vodUserCosmetics = {};

async function _preload7TVUserCosmetics() {
    // Collect unique Twitch user IDs from all messages
    const userIds = [...new Set(_vodMsgs.map(m => m.userId).filter(Boolean))];
    if (!userIds.length) return;

    // 7TV supports querying multiple users via GQL
    const BATCH = 100;
    for (let i = 0; i < userIds.length; i += BATCH) {
        const batch = userIds.slice(i, i + BATCH);
        try {
            const res = await fetch('https://7tv.io/v3/gql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{
                    users(ids: ${JSON.stringify(batch.map(id => 'twitch:' + id))}) {
                        id style { badge_id paint_id }
                        connections { platform id }
                    }
                }` }),
            });
            if (!res.ok) continue;
            const data = await res.json();
            for (const user of data.data?.users || []) {
                const twitchConn = (user.connections || []).find(c => c.platform === 'TWITCH');
                if (!twitchConn) continue;
                const cosmetics = { paint: null, badgeUrl: null };
                if (user.style?.badge_id) {
                    cosmetics.badgeUrl = `https://cdn.7tv.app/badge/${user.style.badge_id}/2x.webp`;
                }
                if (user.style?.paint_id) {
                    // Fetch paint definition
                    try {
                        const pr = await fetch('https://7tv.io/v3/gql', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query: `{
                                cosmetics(list: ["${user.style.paint_id}"]) {
                                    paints { function color stops { at color } angle repeat image_url shadows { x_offset y_offset radius color } }
                                }
                            }` }),
                        });
                        if (pr.ok) {
                            const pd = await pr.json();
                            cosmetics.paint = pd?.data?.cosmetics?.paints?.[0] || null;
                        }
                    } catch(e) {}
                }
                _vodUserCosmetics[twitchConn.id] = cosmetics;
            }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 50));
    }

    // Preload 7TV badge images for users that have them
    await Promise.all(Object.values(_vodUserCosmetics).map(async c => {
        if (c.badgeUrl) c.badgeImg = await _loadImg(c.badgeUrl);
    }));
}

// Convert 7TV paint to canvas fillStyle (gradient or solid color)
function _paintToFillStyle(ctx, paint, x, y, w) {
    if (!paint) return null;
    const intToRGBA = n => {
        const u = n >>> 0;
        return `rgba(${(u>>24)&255},${(u>>16)&255},${(u>>8)&255},${((u&255)/255).toFixed(3)})`;
    };
    const stops = (paint.stops || []).map(s => ({ at: s.at, color: intToRGBA(s.color) }));
    if (!stops.length) return null;

    switch (paint.function) {
        case 'LINEAR_GRADIENT': {
            const angle = ((paint.angle ?? 90) * Math.PI) / 180;
            const dx = Math.cos(angle) * w, dy = Math.sin(angle) * w;
            const g = ctx.createLinearGradient(x, y, x + dx, y + dy);
            stops.forEach(s => g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color));
            return g;
        }
        case 'RADIAL_GRADIENT': {
            const g = ctx.createRadialGradient(x + w/2, y, 0, x + w/2, y, w/2);
            stops.forEach(s => g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color));
            return g;
        }
        default:
            return stops[0]?.color || null;
    }
}
}

function _badgeImgForSet(setID, version) {
    if (!setID) {
        // Twitch redacts subscriber badge setID without broadcaster auth.
        // Fall back to generic subscriber badge.
        return _vodBadgeMap['subscriber/1'] || _vodBadgeMap['subscriber/0'] || null;
    }
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
                // Check if this word is a third-party emote
                const thirdImg = !/^\s+$/.test(part) ? _vodThirdEmoteMap[part] : null;
                if (thirdImg && thirdImg instanceof HTMLImageElement) {
                    const w = thirdImg.naturalWidth > 0
                        ? Math.round(thirdImg.naturalWidth * emoteH / thirdImg.naturalHeight) : emoteH;
                    tokens.push({ type: 'emote', img: thirdImg, w, h: emoteH });
                } else {
                    tokens.push({ type: 'text', text: part, w: _measure(ctx, part, msgFont) });
                }
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

    // Twitch badges
    for (const badge of (msg.badges || [])) {
        const img = _badgeImgForSet(badge.setID, badge.version);
        if (!img) continue;
        ctx.drawImage(img, x, baseline - badgeSize + 1, badgeSize, badgeSize);
        x += badgeSize + 2;
    }
    // 7TV cosmetic badge
    const _7tvCosmetics = msg.userId ? _vodUserCosmetics[msg.userId] : null;
    if (_7tvCosmetics?.badgeImg) {
        ctx.drawImage(_7tvCosmetics.badgeImg, x, baseline - badgeSize + 1, badgeSize, badgeSize);
        x += badgeSize + 2;
    }

    if (cfg.shadowColor) { ctx.shadowColor = cfg.shadowColor; ctx.shadowBlur = 4; }

    ctx.font = nameFont;
    const nameW = _measure(ctx, msg.username + ': ', nameFont);

    // Username — apply 7TV paint gradient if available
    const _paint = _7tvCosmetics?.paint || null;
    if (_paint) {
        const fill = _paintToFillStyle(ctx, _paint, x, baseline - cfg.nameFontSize, nameW);
        if (fill) {
            // Draw painted name via temp OffscreenCanvas for correct gradient clipping
            const pw = Math.ceil(nameW) + 4;
            const ph = Math.ceil(cfg.nameFontSize * 1.5);
            const tc = new OffscreenCanvas(pw, ph);
            const tctx = tc.getContext('2d');
            tctx.font = nameFont;
            const tFill = _paintToFillStyle(tctx, _paint, 0, ph - cfg.nameFontSize, pw);
            tctx.fillStyle = tFill || msg.color || '#9146FF';
            tctx.fillText(msg.username + ':', 0, ph - 4);
            ctx.drawImage(tc, x, baseline - ph + 4);
        } else {
            ctx.fillStyle = msg.color || '#9146FF';
            ctx.fillText(msg.username + ':', x, baseline);
        }
    } else {
        ctx.fillStyle = msg.color || '#9146FF';
        ctx.fillText(msg.username + ':', x, baseline);
    }

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

    // Smooth entry — accumulate height of newly appeared messages and decay it
    const currentIds = new Set(visible.slice(startIdx).map(
        v => v.msg.id || (v.msg.offset + ':' + v.msg.username)));
    let newH = 0;
    for (let i = startIdx; i < visible.length; i++) {
        const id = visible[i].msg.id || (visible[i].msg.offset + ':' + visible[i].msg.username);
        if (!_vodPrevMsgIds.has(id)) newH += heights[i];
    }
    if (newH > 0) _vodEntryDisp += newH;
    _vodEntryDisp *= 0.82;
    _vodPrevMsgIds = currentIds;

    let y = canvasH + Math.round(_vodEntryDisp);
    for (let i = visible.length - 1; i >= startIdx; i--) {
        y -= heights[i];
        _drawMsg(ctx, visible[i].msg, y, visible[i].opacity, canvasW, cfg);
    }
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
        await _preloadThirdPartyEmotes();

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