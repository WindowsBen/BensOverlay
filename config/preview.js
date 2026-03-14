// ─── config/preview.js ────────────────────────────────────────────────────────
// Live chat preview panel. Re-renders on every settings change.
// Mod animations (ban/timeout) are JS-driven loops: simple one-shot CSS
// animations restarted every few seconds by removing/re-inserting the element.

// ── Light mode state ──────────────────────────────────────────────────────────
let _pvLight = false;

function togglePreviewLight() {
    _pvLight = !_pvLight;
    const panel = document.getElementById('preview-chat');
    const btn   = document.getElementById('preview-light-btn');
    if (panel) panel.style.background = _pvLight ? '#f0f2f5' : '';
    if (btn) {
        btn.textContent = _pvLight ? '🌙 Dark' : '☀️ Light';
        btn.title = _pvLight ? 'Switch to dark background' : 'Switch to light background';
    }
    renderChatPreview();
}

// ── Font loading ──────────────────────────────────────────────────────────────
let _previewFontFamily = '';

function _loadPreviewFont() {
    const url = document.getElementById('fontUrl')?.value?.trim();
    if (!url) { _previewFontFamily = ''; return; }
    if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = url;
        document.head.appendChild(link);
    }
    fetch(url).then(r => r.text()).then(css => {
        const m = css.match(/font-family:\s*['"]([^'"]+)['"]/i);
        if (m) {
            _previewFontFamily = m[1];
            document.fonts.load(`16px "${_previewFontFamily}"`).finally(renderChatPreview);
        }
    }).catch(() => {});
}

// ── Value helpers ─────────────────────────────────────────────────────────────
function _pv(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? (el.value ?? fallback) : fallback;
}
function _pc(id, fallback = '#888888') {
    const el = document.getElementById(id);
    return (el && el.value) ? el.value : fallback;
}
function _po(id, fallback = 100) {
    const el = document.getElementById(id);
    return el ? parseInt(el.value ?? fallback) : fallback;
}
function _prgba(colorId, opId, fallback = '#888888') {
    try {
        const hex = _pc(colorId, fallback).replace('#', '');
        const r = parseInt(hex.slice(0,2)||'88', 16);
        const g = parseInt(hex.slice(2,4)||'88', 16);
        const b = parseInt(hex.slice(4,6)||'88', 16);
        const a = _po(opId, 100) / 100;
        return `rgba(${r},${g},${b},${a})`;
    } catch { return fallback; }
}
function _pfont() {
    return _previewFontFamily ? `font-family:'${_previewFontFamily}',sans-serif;` : '';
}
function _pnum(id, fallback) {
    const v = parseInt(_pv(id, ''));
    return isNaN(v) ? fallback : v;
}
function _on(id) {
    const el = document.getElementById(id);
    return el ? el.checked : true;
}
// Text colours that adapt to light/dark mode
function _tc(dark = 'rgba(255,255,255,0.88)', light = 'rgba(0,0,0,0.82)') {
    return _pvLight ? light : dark;
}
function _tcFaint(dark = 'rgba(255,255,255,0.45)', light = 'rgba(0,0,0,0.38)') {
    return _pvLight ? light : dark;
}

// ── Inject animation CSS once ─────────────────────────────────────────────────
// All mod/poll/prediction animations are simple one-shot keyframes.
// Looping is handled by JS (_restartAnim), not by CSS `infinite`.
let _animInjected = false;
function _ensureAnimCSS() {
    if (_animInjected) return;
    _animInjected = true;
    const s = document.createElement('style');
    s.id = 'pv-anim-css';
    s.textContent = `
/* ── Ban animation ────────────────────────────────────────── */
@keyframes pv-hammer-windup { from{transform:rotate(0deg)} to{transform:rotate(-55deg)} }
@keyframes pv-hammer-swing  { from{transform:rotate(-55deg)} to{transform:rotate(55deg)} }
@keyframes pv-shockwave     {
    0%   { transform:translate(-50%,-50%) scale(0); opacity:1; }
    100% { transform:translate(-50%,-50%) scale(1.4); opacity:0; }
}
@keyframes pv-scatter {
    from { transform:translate(0,0) rotate(0deg); opacity:1; }
    to   { transform:translate(var(--tx),var(--ty)) rotate(var(--tr)); opacity:0; }
}

/* ── Timeout animation ────────────────────────────────────── */
@keyframes pv-clock-drop {
    from { transform:translateY(-28px); opacity:0; }
    to   { transform:translateY(0);     opacity:1; }
}
@keyframes pv-hand-fast { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes pv-freeze {
    0%   { opacity:1;   filter:none;      }
    60%  { opacity:0.4; filter:blur(1px); }
    100% { opacity:0;   filter:blur(3px); }
}

/* ── Poll / prediction bar pulses (truly infinite, OK here) ── */
@keyframes pv-bar-a { 0%,100%{width:72%} 50%{width:76%} }
@keyframes pv-bar-b { 0%,100%{width:28%} 50%{width:24%} }
@keyframes pv-bar-c { 0%,100%{width:62%} 50%{width:65%} }
@keyframes pv-bar-d { 0%,100%{width:38%} 50%{width:35%} }
`;
    document.head.appendChild(s);
}

// ── Preview badge system ───────────────────────────────────────────────────────
// Fetches real badge images from Twitch, FFZ, Chatterino and 7TV so the preview
// shows exactly what viewers will see. All fetches are cached for the session.
// Re-fetches channel badges when the channel input changes.

const _PV_CLIENT_ID = 'ti9ahr6lkym6anpij3d4f2cyjhij18';

// category → CDN URL of a representative badge image
const _pvBadgeUrl = {
    broadcaster: '',
    moderator:   '',
    vip:         '',
    subscriber:  '',
    bits:        '',   // custom category representative
    ffz:         '',
    chatterino:  '',
    seventv:     '',
};

let _pvBadgesLoaded    = false;
let _pvChannelLoaded   = ''; // which channel we fetched channel badges for
let _pvThirdPartyLoaded = false;

function _pvBadgeImg(url, title) {
    if (!url) return '';
    // Size in px derived from name font size so badges track the name slider, not message slider
    const ns = _pnum('nameFontSize', 15);
    const sz = Math.round(ns * 0.8);
    return `<img src="${url}" width="${sz}" height="${sz}" alt="" title="${title}"
        style="vertical-align:middle;margin-right:2px;border-radius:2px;flex-shrink:0;width:${sz}px;height:${sz}px;object-fit:contain;"
        onerror="this.style.display='none'">`;
}

async function _pvFetchTwitchBadges() {
    const token = localStorage.getItem('twitch_access_token');
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}`, 'Client-Id': _PV_CLIENT_ID };

    try {
        const res = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        if (!res.ok) return;
        const data = await res.json();
        for (const set of data.data || []) {
            const url = set.versions?.[0]?.image_url_4x;
            if (!url) continue;
            if (set.set_id === 'broadcaster') _pvBadgeUrl.broadcaster = url;
            if (set.set_id === 'moderator')   _pvBadgeUrl.moderator   = url;
            if (set.set_id === 'vip')         _pvBadgeUrl.vip         = url;
            if (set.set_id === 'bits')        _pvBadgeUrl.bits        = url;
            if (set.set_id === 'subscriber')  _pvBadgeUrl.subscriber  = url;
        }
    } catch(e) { console.warn('[Preview] Global badge fetch failed', e); }
}

async function _pvFetchChannelBadges(channelName) {
    if (!channelName || channelName === _pvChannelLoaded) return;
    const token = localStorage.getItem('twitch_access_token');
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}`, 'Client-Id': _PV_CLIENT_ID };

    try {
        const userRes = await fetch(
            `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelName)}`, { headers });
        if (!userRes.ok) return;
        const userData = await userRes.json();
        const userId = userData.data?.[0]?.id;
        if (!userId) return;

        const badgeRes = await fetch(
            `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${userId}`, { headers });
        if (!badgeRes.ok) return;
        const badgeData = await badgeRes.json();
        for (const set of badgeData.data || []) {
            const url = set.versions?.[0]?.image_url_4x;
            if (!url) continue;
            // Channel badges override global ones (custom sub tiers, broadcaster icon)
            if (set.set_id === 'broadcaster') _pvBadgeUrl.broadcaster = url;
            if (set.set_id === 'subscriber')  _pvBadgeUrl.subscriber  = url;
        }
        _pvChannelLoaded = channelName;
        renderChatPreview();
    } catch(e) { console.warn('[Preview] Channel badge fetch failed', e); }
}

async function _pvFetchThirdPartyBadges() {
    if (_pvThirdPartyLoaded) return;
    _pvThirdPartyLoaded = true;

    // FFZ — pick the first badge from the global list
    try {
        const res = await fetch('https://api.frankerfacez.com/v1/badges/ids');
        if (res.ok) {
            const data = await res.json();
            const first = Object.values(data.badges || {})[0];
            if (first) _pvBadgeUrl.ffz = first.urls?.['4'] || first.urls?.['2'] || first.urls?.['1'] || '';
        }
    } catch(e) {}

    // Chatterino — field is `image3` (highest res) per the actual API response
    try {
        const res = await fetch('https://api.chatterino.com/badges');
        if (res.ok) {
            const data = await res.json();
            const first = (data.badges || [])[0];
            if (first) _pvBadgeUrl.chatterino = first.image3 || first.image2 || first.image1 || '';
        }
    } catch(e) {}

    // 7TV — fetch the global cosmetics list and pick the first badge
    try {
        const res = await fetch('https://7tv.io/v3/cosmetics?user_identifier=twitch_id');
        if (res.ok) {
            const data = await res.json();
            const badge = (data.badges || [])[0];
            if (badge?.id) {
                _pvBadgeUrl.seventv = `https://cdn.7tv.app/badge/${badge.id}/4x.webp`;
            }
        }
    } catch(e) {}

    // Fallback: if still empty, use a long-standing stable badge ID
    if (!_pvBadgeUrl.seventv) {
        _pvBadgeUrl.seventv = 'https://cdn.7tv.app/badge/01GAF8RWW8000E8VNG1S1RMTBA/4x.webp';
    }

    renderChatPreview();
}

async function _pvInitBadges() {
    if (!_pvBadgesLoaded) {
        _pvBadgesLoaded = true;
        await _pvFetchTwitchBadges();
        renderChatPreview();
    }
    // Channel field may not be populated on first load — auth.js fills it async.
    // Try immediately and again after a delay to catch whichever fires first.
    const tryChannel = () => {
        const channel = document.getElementById('channel')?.value?.trim();
        if (channel) _pvFetchChannelBadges(channel);
    };
    tryChannel();
    setTimeout(tryChannel, 1500);
    setTimeout(tryChannel, 4000); // extra retry in case auth is slow
    _pvFetchThirdPartyBadges();
}

// Returns badge img HTML for a named role, gated on its toggle
function _badges(...roles) {
    const toggleMap = {
        broadcaster: 'showBadgeBroadcaster',
        moderator:   'showBadgeModerator',
        vip:         'showBadgeVIP',
        subscriber:  'showBadgeSubscriber',
        bits:        'showBadgeCustom',
        ffz:         'showBadgeFFZ',
        chatterino:  'showBadgeChatterino',
        seventv:     'showBadge7TV',
    };
    return roles
        .filter(r => _on(toggleMap[r] ?? 'showBadgeCustom'))
        .map(r => _pvBadgeImg(_pvBadgeUrl[r], r))
        .join('');
}


function _shadow() {
    const sc = _prgba('shadowColor','shadowOpacity','#00000000');
    // Skip if effectively transparent
    if (sc === 'rgba(0,0,0,0)' || sc === 'rgba(0,0,0,0.00)' || sc.endsWith(',0)')) return '';
    return `text-shadow:1px 1px 3px ${sc},0 0 6px ${sc};`;
}

// ── Shared message styles ─────────────────────────────────────────────────────
function _msgWrap(extra = '') {
    const gap = _pnum('messageGap', 8);
    const lh  = parseFloat(_pv('lineHeight', '')) || 1.4;
    const fs  = _pnum('messageFontSize', 15);
    return `font-size:${fs}px;line-height:${lh};margin-bottom:${gap}px;word-break:break-word;${_pfont()}${extra}`;
}

function _nameSpan(name, color, badgeHtml = '') {
    const ns = _pnum('nameFontSize', 15);
    return `${badgeHtml}<span style="color:${color};font-weight:700;font-size:${ns}px;${_shadow()}${_pfont()}">${name}</span>`;
}

function _msgText(text, extraStyle = '') {
    return `<span style="color:${_tc()};${_shadow()}${extraStyle}"> ${text}</span>`;
}

// ── Message renderers ─────────────────────────────────────────────────────────
function _msgChat(name, color, text, badgeHtml = '') {
    return `<div style="${_msgWrap()}">${_nameSpan(name, color, badgeHtml)}${_msgText(text)}</div>`;
}

// ── Fire and Ice paint ────────────────────────────────────────────────────────
// Hardcoded gradient from the 7TV "Fire and Ice" paint, applied to PurpleFox
// in the /me preview row. Inline CSS works here since we're in a real browser
// (not OBS, which drops -webkit-background-clip from inline styles).
const _PV_PAINT_GRADIENT = 'linear-gradient(291deg, rgb(29,26,255) 19%, rgb(46,231,255) 39%, rgb(255,255,255) 46%, rgb(255,0,0) 53%, rgb(255,123,0) 89%)';

function _pvPaintStyle() {
    return `background-image:${_PV_PAINT_GRADIENT};`
         + `-webkit-background-clip:text;background-clip:text;`
         + `-webkit-text-fill-color:transparent;color:transparent;`
         + `display:inline-block;`;
}

function _msgMe() {
    const style    = _pv('meStyle', 'colored');
    const usePaint = _on('show7TVPaints');
    const fallback = '#E91E8C';

    // Name — paint when enabled, plain pink otherwise
    const nameStyle = usePaint
        ? `${_pvPaintStyle()}font-weight:700;font-size:${_pnum('nameFontSize',15)}px;${_pfont()}`
        : `color:${fallback};font-weight:700;font-size:${_pnum('nameFontSize',15)}px;${_shadow()}${_pfont()}`;
    const nameHtml = `<span style="${nameStyle}">PurpleFox</span>`;

    // Message text — paint only when colored style AND paint enabled
    let msgStyle;
    if (style === 'colored') {
        msgStyle = usePaint
            ? `${_pvPaintStyle()}${_shadow()}`
            : `color:${fallback};${_shadow()}`;
    } else if (style === 'italic') {
        msgStyle = `font-style:italic;color:${_tc()};${_shadow()}`;
    } else {
        msgStyle = `color:${_tc()};${_shadow()}`;
    }

    return `<div style="${_msgWrap()}">${nameHtml}<span style="${msgStyle}"> * dances in the chat</span></div>`;
}

function _msgHighlight() {
    const accent = _prgba('highlightAccent','highlightAccentOpacity','#FFAA00');
    const bg     = _prgba('highlightBg','highlightBgOpacity','#2a1e00');
    return `<div style="${_msgWrap(`border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:5px 8px;`)}">
        ${_nameSpan('GoldViewer','#FFD700', _badges('bits'))}${_msgText('✨ This message is highlighted!')}
    </div>`;
}

function _msgReply() {
    return `<div style="${_msgWrap()}">
        <div style="font-size:0.8em;color:${_tcFaint()};margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <svg style="width:10px;height:10px;vertical-align:middle;margin-right:2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            <span style="color:${_tcFaint('rgba(255,255,255,0.6)','rgba(0,0,0,0.5)')};font-weight:600;">StreamerDude</span> lol nice one
        </div>
        ${_nameSpan('RegularFan','#3498DB', _badges('subscriber'))}${_msgText('@StreamerDude haha same')}
    </div>`;
}

function _msgEvent(icon, name, detail, aId, aOId, bId, bOId, extra='') {
    const accent = _prgba(aId, aOId, '#9146FF');
    const bg     = _prgba(bId, bOId, '#1a0a2e');
    return `<div style="${_msgWrap(`border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:6px 8px;display:flex;align-items:flex-start;gap:7px;`)}">
        <span style="color:${accent};flex-shrink:0;font-size:16px;margin-top:1px;">${icon}</span>
        <span>
            <span style="color:${accent};font-weight:700;">${name}</span>
            <span style="color:${_tc('rgba(220,210,255,0.85)','rgba(60,40,100,0.85)')};font-style:italic;"> ${detail}</span>
            ${extra ? `<span style="display:block;margin-top:3px;color:${_tc()}">${extra}</span>` : ''}
        </span>
    </div>`;
}

function _msgAnnouncement() {
    const accent = 'rgba(169,112,255,0.9)';
    const bg     = _pvLight ? 'rgba(120,60,220,0.08)' : 'rgba(80,40,160,0.15)';
    const ICON   = `<svg style="width:13px;height:13px;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
    const gap    = _pnum('messageGap', 8);
    const lh     = parseFloat(_pv('lineHeight','')) || 1.4;
    return `<div style="border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:6px 8px;margin-bottom:${gap}px;line-height:${lh};${_pfont()}">
        <div style="color:${accent};font-size:11px;font-weight:700;margin-bottom:3px;">${ICON}Announcement</div>
        ${_nameSpan('ModeratorBot','#9146FF', _badges('moderator'))}${_msgText('Remember to follow the community guidelines! 📋')}
    </div>`;
}

// ── Animated mod renderers ────────────────────────────────────────────────────
// These return static HTML with one-shot CSS animations. JS (_restartAnim)
// re-inserts the element every few seconds to replay the animation.

function _animBan() {
    _ensureAnimCSS();
    const accent = _prgba('banAccent','banAccentOpacity','#FF4444');
    const bg     = _prgba('banBg','banBgOpacity','#2a0000');
    const gap    = _pnum('messageGap', 8);

    const letters = 'BadUser'.split('').map((ch, i) => {
        const angle = (Math.random() * 260) - 220;
        const dist  = 35 + Math.random() * 40;
        const tx    = Math.round(Math.cos(angle * Math.PI/180) * dist);
        const ty    = Math.round(Math.sin(angle * Math.PI/180) * dist - 15);
        const tr    = Math.round((Math.random() - 0.5) * 360);
        return `<span style="display:inline-block;--tx:${tx}px;--ty:${ty}px;--tr:${tr}deg;
            color:${accent};font-weight:900;font-size:14px;letter-spacing:1px;text-transform:uppercase;
            animation:pv-scatter 0.45s ease-out ${0.65 + i * 0.05}s both;">${ch}</span>`;
    }).join('');

    return `<div id="pv-ban-anim" style="background:${bg};border:1px solid ${accent};border-radius:6px;
        padding:8px 10px;margin-bottom:${gap}px;position:relative;height:76px;overflow:hidden;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
        <div style="position:absolute;top:4px;left:50%;width:28px;height:28px;transform-origin:bottom center;
            transform:translateX(-50%);
            animation:pv-hammer-windup 0.3s ease-out 0.05s both, pv-hammer-swing 0.2s ease-in 0.38s forwards;">
            <svg viewBox="0 0 64 64" fill="none" width="28" height="28">
                <rect x="28" y="28" width="9" height="30" rx="4" fill="#8B5E3C" stroke="#5C3D1E" stroke-width="1.5"/>
                <rect x="10" y="8" width="44" height="26" rx="6" fill="#C0C0C0" stroke="#888" stroke-width="1.5"/>
                <rect x="12" y="10" width="40" height="10" rx="4" fill="#E8E8E8" opacity="0.6"/>
            </svg>
        </div>
        <div style="position:absolute;width:56px;height:56px;top:50%;left:50%;
            animation:pv-shockwave 0.35s ease-out 0.65s both;">
            <svg viewBox="0 0 100 100" fill="none" width="56" height="56">
                <circle cx="50" cy="50" r="18" stroke="${accent}" stroke-width="3" opacity="0.9"/>
                <circle cx="50" cy="50" r="38" stroke="${accent}" stroke-width="1.5" opacity="0.45"/>
            </svg>
        </div>
        <div style="position:relative;z-index:2;margin-top:24px;">${letters}</div>
        <div style="font-size:10px;color:${accent};opacity:0.55;letter-spacing:0.5px;">BANNED</div>
    </div>`;
}

function _animTimeout() {
    _ensureAnimCSS();
    const accent = _prgba('timeoutAccent','timeoutAccentOpacity','#FF8C00');
    const bg     = _prgba('timeoutBg','timeoutBgOpacity','#1a1200');
    const gap    = _pnum('messageGap', 8);

    const letters = 'SlowpokeFan'.split('').map((ch, i) =>
        `<span style="display:inline-block;color:${accent};font-weight:900;font-size:12px;letter-spacing:0.3px;
            animation:pv-freeze 0.4s ease-out ${1.0 + i * 0.05}s both;">${ch}</span>`
    ).join('');

    return `<div id="pv-timeout-anim" style="background:${bg};border:1px solid ${accent};border-radius:6px;
        padding:8px 10px;margin-bottom:${gap}px;position:relative;height:82px;overflow:hidden;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;">
        <div style="position:relative;width:40px;height:40px;animation:pv-clock-drop 0.4s cubic-bezier(0.2,0,0.2,1.3) 0.1s both;">
            <svg viewBox="0 0 80 80" fill="none" width="40" height="40" style="position:absolute;top:0;left:0;">
                <circle cx="40" cy="40" r="34" fill="#1a1a2e" stroke="${accent}" stroke-width="3"/>
                <line x1="40" y1="10" x2="40" y2="18" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="40" y1="62" x2="40" y2="70" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="10" y1="40" x2="18" y2="40" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="62" y1="40" x2="70" y2="40" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="40" cy="40" r="3" fill="${accent}"/>
            </svg>
            <svg viewBox="0 0 80 80" fill="none" width="40" height="40"
                style="position:absolute;top:0;left:0;transform-origin:50% 50%;animation:pv-hand-fast 0.5s linear infinite;">
                <line x1="40" y1="40" x2="40" y2="18" stroke="${accent}" stroke-width="3.5" stroke-linecap="round"/>
            </svg>
            <svg viewBox="0 0 80 80" fill="none" width="40" height="40"
                style="position:absolute;top:0;left:0;transform-origin:50% 50%;animation:pv-hand-fast 0.15s linear infinite;">
                <line x1="40" y1="40" x2="40" y2="12" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
            </svg>
        </div>
        <div>${letters}</div>
        <div style="font-size:10px;color:${accent};opacity:0.55;letter-spacing:0.5px;">TIMED OUT · 10m</div>
    </div>`;
}

// ── JS animation loop for mod actions ─────────────────────────────────────────
// Restarts a CSS animation by removing the element and re-inserting it, which
// forces the browser to reset and replay all animations on that subtree.
let _modAnimTimer = null;

function _restartAnim(id, builderFn) {
    const el = document.getElementById(id);
    if (!el || !el.parentNode) return;
    // Replace with a freshly-rendered version (new random scatter positions too)
    const next = el.nextSibling;
    const parent = el.parentNode;
    el.remove();
    const tmp = document.createElement('div');
    tmp.innerHTML = builderFn();
    const fresh = tmp.firstElementChild;
    parent.insertBefore(fresh, next);
}

function _startModAnimLoop() {
    if (_modAnimTimer) { clearInterval(_modAnimTimer); _modAnimTimer = null; }
    const hasBan     = _on('showBans');
    const hasTimeout = _on('showTimeouts');
    if (!hasBan && !hasTimeout) return;

    _modAnimTimer = setInterval(() => {
        if (hasBan)     _restartAnim('pv-ban-anim',     _animBan);
        if (hasTimeout) _restartAnim('pv-timeout-anim', _animTimeout);
    }, 3200);
}

// ── Animated widget renderers ─────────────────────────────────────────────────
function _widgetPoll() {
    _ensureAnimCSS();
    const accent    = _prgba('pollAccent','pollAccentOpacity','#A970FF');
    const bg        = _prgba('pollBg','pollBgOpacity','#0e0e1e');
    const bar       = _prgba('pollBar','pollBarOpacity','#A970FF');
    const winner    = _prgba('pollWinner','pollWinnerOpacity','#FFD700');
    const gap       = _pnum('messageGap', 8);
    const textMuted = _pvLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)';
    const textAlt   = _pvLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:8px;padding:10px 12px;margin-bottom:${gap}px;${_pfont()}">
        <div style="color:${accent};font-weight:700;font-size:13px;margin-bottom:8px;">📊 What game next?</div>
        <div style="margin-bottom:5px;">
            <div style="display:flex;justify-content:space-between;color:${winner};font-weight:700;font-size:12px;margin-bottom:3px;"><span>Elden Ring</span><span>72%</span></div>
            <div style="height:6px;background:rgba(128,128,128,0.15);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${winner};border-radius:3px;animation:pv-bar-a 2s ease-in-out infinite;"></div></div>
        </div>
        <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;color:${textAlt};font-size:12px;margin-bottom:3px;"><span>Hollow Knight</span><span>28%</span></div>
            <div style="height:6px;background:rgba(128,128,128,0.15);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${bar};border-radius:3px;animation:pv-bar-b 2s ease-in-out infinite;"></div></div>
        </div>
        <div style="color:${textMuted};font-size:10px;">1,240 votes · 45s remaining</div>
    </div>`;
}

function _widgetPrediction() {
    _ensureAnimCSS();
    const bg      = _prgba('predBg','predBgOpacity','#0d0d1a');
    const gap     = _pnum('messageGap', 8);
    const colors  = ['#5b8dd9','#d95b5b'];
    const textH   = _pvLight ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.88)';
    const textAlt = _pvLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.72)';
    const textM   = _pvLight ? 'rgba(0,0,0,0.4)'  : 'rgba(255,255,255,0.3)';
    return `<div style="background:${bg};border:1px solid rgba(169,112,255,0.4);border-radius:8px;padding:10px 12px;margin-bottom:${gap}px;${_pfont()}">
        <div style="color:${textH};font-weight:700;font-size:13px;margin-bottom:8px;">🔮 Will I beat the boss?</div>
        <div style="margin-bottom:5px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <div style="width:8px;height:8px;border-radius:50%;background:${colors[0]};flex-shrink:0;"></div>
                <span style="color:${textAlt};flex:1;font-size:12px;">Yes, ez clap</span>
                <span style="color:${colors[0]};font-weight:700;font-size:12px;">62%</span>
            </div>
            <div style="height:5px;background:rgba(128,128,128,0.15);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${colors[0]};border-radius:3px;animation:pv-bar-c 2.3s ease-in-out infinite;"></div></div>
        </div>
        <div style="margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <div style="width:8px;height:8px;border-radius:50%;background:${colors[1]};flex-shrink:0;"></div>
                <span style="color:${textAlt};flex:1;font-size:12px;">No chance lol</span>
                <span style="color:${colors[1]};font-weight:700;font-size:12px;">38%</span>
            </div>
            <div style="height:5px;background:rgba(128,128,128,0.15);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${colors[1]};border-radius:3px;animation:pv-bar-d 2.3s ease-in-out infinite;"></div></div>
        </div>
        <div style="color:${textM};font-size:10px;">3,800 pts wagered · Locked</div>
    </div>`;
}

function _widgetHypeTrain() {
    const accent = _prgba('htAccent','htAccentOpacity','#FF6B35');
    const bg     = _prgba('htBg','htBgOpacity','#1a0a00');
    const bar    = _prgba('htBar','htBarOpacity','#FF6B35');
    const gap    = _pnum('messageGap', 8);
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:8px;padding:8px 12px;margin-bottom:${gap}px;display:flex;align-items:center;gap:8px;${_pfont()}">
        <span style="color:${accent};font-size:12px;font-weight:800;letter-spacing:1px;white-space:nowrap;">🚂 HYPE TRAIN</span>
        <div style="background:${accent};border-radius:4px;padding:1px 6px;font-size:12px;font-weight:900;color:#fff;">2</div>
        <div style="flex:1;"><div style="height:6px;background:rgba(128,128,128,0.15);border-radius:3px;"><div style="width:55%;height:100%;background:${bar};border-radius:3px;box-shadow:0 0 6px ${bar};"></div></div></div>
        <span style="color:${_tcFaint()};font-size:11px;white-space:nowrap;">142s</span>
    </div>`;
}

// ── Full preview render ────────────────────────────────────────────────────────
function renderChatPreview() {
    // Stop any running mod animation loop — we're about to rebuild innerHTML
    if (_modAnimTimer) { clearInterval(_modAnimTimer); _modAnimTimer = null; }

    const panel = document.getElementById('preview-chat');
    if (!panel) return;

    const resubLabel  = _pv('resubLabel',  'resubscribed')  || 'resubscribed';
    const giftLabel   = _pv('giftLabel',   'gifted')        || 'gifted';
    const bitsLabel   = _pv('bitsLabel',   'cheered')       || 'cheered';
    const streakLabel = _pv('streakLabel', 'is on a')       || 'is on a';
    const raidLabel        = _pv('raidIncomingLabel','is raiding with') || 'is raiding with';
    const raidOutgoingLabel = _pv('raidOutgoingLabel','is raiding') || 'is raiding';
    const redeemLabel = _pv('redeemLabel', 'redeemed')      || 'redeemed';

    try {
        const parts = [
            _on('showHypeTrain')     && _widgetHypeTrain(),
            _msgChat('StreamerDude', '#9146FF', 'Hey chat, welcome to the stream! 👋', _badges('broadcaster')),
            _msgChat('CoolViewer99', '#FF6B6B', "Let's go! PogChamp",                  _badges('subscriber', 'bits')),
            _msgChat('ThirdPartyFan','#43B581', 'poggers in chat',                     _badges('vip', 'ffz', 'chatterino', 'seventv')),
            _on('showReplies')       && _msgReply(),
            _pv('meStyle','colored') !== 'none' && _msgMe(),
            _on('showAnnouncements') && _msgAnnouncement(),
            _on('showHighlights')    && _msgHighlight(),
            _on('showResubs')        && _msgEvent('⭐','NightOwl',   `${resubLabel} (6 months, Tier 1)!`,         'resubAccent','resubAccentOpacity','resubBg','resubBgOpacity'),
            _on('showGifts')         && _msgEvent('🎁','GenGifter',  `${giftLabel} 5 Tier 1 subs to the channel!`,'giftAccent','giftAccentOpacity','giftBg','giftBgOpacity'),
            _on('showBits')          && _msgEvent('💎','BitsBoss',   `${bitsLabel} 500 bits!`,                    'bitsAccent','bitsAccentOpacity','bitsBg','bitsBgOpacity','"GG streamers!"'),
            _on('showRedeems')       && _msgEvent('⚡','PointSpender',`${redeemLabel} Hydrate!`,                  'redeemAccent','redeemAccentOpacity','redeemBg','redeemBgOpacity'),
            _on('showStreaks')        && _msgEvent('🔥','MarathonFan',`${streakLabel} 30-stream watch streak!`,   'streakAccent','streakAccentOpacity','streakBg','streakBgOpacity'),
            _on('showRaidIncoming')  && _msgEvent('🚀','BigRaider',   `${raidLabel} 250 viewers!`,                  'raidIncomingAccent','raidIncomingAccentOpacity','raidIncomingBg','raidIncomingBgOpacity'),
            _on('showRaidOutgoing')  && _msgEvent('🚀','StreamerDude',`${raidOutgoingLabel} SmallStreamer with 50 viewers!`, 'raidOutgoingAccent','raidOutgoingAccentOpacity','raidOutgoingBg','raidOutgoingBgOpacity'),
            _on('showBans')          && _animBan(),
            _on('showTimeouts')      && _animTimeout(),
            _on('showPolls')         && _widgetPoll(),
            _on('showPredictions')   && _widgetPrediction(),
        ];

        const html = parts.filter(Boolean).join('');
        panel.innerHTML = html ||
            `<div style="color:${_tcFaint()};font-size:12px;padding:12px;font-style:italic;">All messages hidden — enable some settings to see a preview.</div>`;

        // Start JS loop to replay mod animations
        _startModAnimLoop();

    } catch(e) {
        panel.innerHTML = `<div style="color:rgba(255,80,80,0.6);font-size:12px;padding:8px;">Preview error — check console.</div>`;
        console.warn('Preview render error:', e);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _loadPreviewFont();
    document.getElementById('fontUrl')?.addEventListener('change', _loadPreviewFont);

    // Fetch real badge images — runs once on load then re-checks on channel change
    _pvInitBadges();
    document.getElementById('channel')?.addEventListener('change', () => {
        _pvChannelLoaded = ''; // force re-fetch for new channel
        _pvInitBadges();
    });

    renderChatPreview();
    document.addEventListener('input',  renderChatPreview);
    document.addEventListener('change', renderChatPreview);
});