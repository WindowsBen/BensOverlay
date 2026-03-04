// ─── config.js ────────────────────────────────────────────────────────────────
// Single source of truth for all overlay settings.
// Reads URL hash parameters (set by the configurator) and exposes them as a
// named CONFIG object. Every other file reads from here — nothing reads params
// directly. CSS variables are also applied here on load.

// URL params are stored in the hash (#) rather than query string (?)
// so the token never appears in server logs.
const params = new URLSearchParams(window.location.hash.substring(1));

// Converts an 8-char hex string (RRGGBBAA, no #) to a CSS #RRGGBBAA color.
// Used to decode the compact color format stored in the URL.
function hex8ToCss(hex8, fallback) {
    if (!hex8 || hex8.length !== 8) return fallback;
    return `#${hex8}`;
}

const CONFIG = {
    channelName:     params.get('channel'),
    fontSize:        params.get('fontSize'),
    shadowColor:     params.get('shadow'),
    showToastEmotes: params.get('toastEmotes') !== '0', // default on

    // Spacing — only set if the user changed from defaults
    messageGap:  params.get('messageGap')  || '',  // px between messages (default 8)
    lineHeight:  params.get('lineHeight')  || '',  // line-height for long messages (default 1.8)

    // Excluded users — lowercase Set for O(1) lookup on every message
    excludedUsers: new Set(
        (params.get('exclude') || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean)
    ),

    // Excluded prefixes — messages starting with any of these are hidden (e.g. "!" for commands)
    excludedPrefixes: (params.get('excludePrefix') || '').split(',').map(p => p.trim()).filter(Boolean),

    showReplies:       params.get('showReplies') !== '0', // default on
    meStyle:           params.get('meStyle') || 'colored', // 'colored' | 'italic' | 'none'
    showAnnouncements: params.get('showAnnouncements') !== '0', // default on

    // Event message toggles — all default off (must be explicitly set to '1')
    showResubs:     params.get('showResubs')     === '1',
    showGifts:      params.get('showGifts')      === '1',
    showBits:       params.get('showBits')        === '1',
    showRedeems:    params.get('showRedeems')    === '1',
    showHighlights: params.get('showHighlights') === '1',
    showStreaks:    params.get('showStreaks')     === '1',

    // Per-event label overrides — empty string means use the built-in default
    resubLabel:   params.get('resubLabel')   || '',
    giftLabel:    params.get('giftLabel')    || '',
    bitsLabel:    params.get('bitsLabel')    || '',
    redeemLabel:  params.get('redeemLabel')  || '',
    streakLabel:  params.get('streakLabel')  || '',

    // Custom font — CSS URL; font-family name is extracted from the stylesheet at load time
    fontUrl: params.get('fontUrl') || '',

    // Badge display options
    disableAllBadges:      params.get('disableAllBadges')      === '1',
    roleOnlyBadges:        params.get('roleOnlyBadges')        === '1',
    showExternalCosmetics: params.get('showExternalCosmetics') !== '0', // default on

    // Twitch API credentials — token comes from URL or localStorage (set by configurator)
    clientId: 'ti9ahr6lkym6anpij3d4f2cyjhij18',
    token:    params.get('token') || localStorage.getItem('twitch_access_token'),
};

// ── Apply CSS variables ────────────────────────────────────────────────────────
if (CONFIG.fontSize)    document.documentElement.style.setProperty('--chat-font-size',      CONFIG.fontSize);
if (CONFIG.shadowColor) document.documentElement.style.setProperty('--chat-shadow-color',   hex8ToCss(CONFIG.shadowColor, '#000000FF'));
if (CONFIG.messageGap)  document.documentElement.style.setProperty('--message-gap',         CONFIG.messageGap + 'px');
if (CONFIG.lineHeight)  document.documentElement.style.setProperty('--message-line-height', CONFIG.lineHeight);

// ── Custom font ────────────────────────────────────────────────────────────────
// Load the font stylesheet, then fetch it again to extract the font-family name
// since there's no DOM API to read that from a loaded <link>.
if (CONFIG.fontUrl) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = CONFIG.fontUrl;
    document.head.appendChild(link);

    fetch(CONFIG.fontUrl)
        .then(r => r.text())
        .then(css => {
            const match = css.match(/font-family:\s*['"]([^'"]+)['"]/i);
            if (match) {
                document.documentElement.style.setProperty('--chat-font-family', match[1]);
            }
        })
        .catch(() => { /* silently ignore if fetch fails */ });
}

// ── Per-event-type accent and background colors ────────────────────────────────
// Each event type has an accent color (icon + border) and a background color.
// Colors are stored as 8-char hex in the URL and applied as CSS variables here.
const cssVars = {
    '--resub-accent':     hex8ToCss(params.get('resubAccent'),     '#9146FFFF'),
    '--resub-bg':         hex8ToCss(params.get('resubBg'),         '#1a0a2eCC'),
    '--gift-accent':      hex8ToCss(params.get('giftAccent'),      '#9146FFFF'),
    '--gift-bg':          hex8ToCss(params.get('giftBg'),          '#1a0a2eCC'),
    '--bits-accent':      hex8ToCss(params.get('bitsAccent'),      '#9146FFFF'),
    '--bits-bg':          hex8ToCss(params.get('bitsBg'),          '#1a0a2eCC'),
    '--redeem-accent':    hex8ToCss(params.get('redeemAccent'),    '#FFB800FF'),
    '--redeem-bg':        hex8ToCss(params.get('redeemBg'),        '#2a1f00CC'),
    '--highlight-accent': hex8ToCss(params.get('highlightAccent'), '#FF00FFFF'),
    '--highlight-bg':     hex8ToCss(params.get('highlightBg'),     '#2a002aCC'),
    '--streak-accent':    hex8ToCss(params.get('streakAccent'),    '#FF6400FF'),
    '--streak-bg':        hex8ToCss(params.get('streakBg'),        '#2a0f00CC'),
};
for (const [key, val] of Object.entries(cssVars)) {
    document.documentElement.style.setProperty(key, val);
}

// Role badges are always shown regardless of the roleOnlyBadges setting —
// they identify channel staff and can't be hidden selectively.
const ROLE_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff', 'admin', 'global_mod', 'lead_moderator']);