// ─── config.js ────────────────────────────────────────────────────────────────
// Reads all URL parameters and exposes them as named constants.
// Every other file imports from here — nothing reads params directly.

const params = new URLSearchParams(window.location.hash.substring(1));

// Parse RRGGBBAA hex string (no #) → #RRGGBBAA for CSS
function hex8ToCss(hex8, fallback) {
    if (!hex8 || hex8.length !== 8) return fallback;
    return `#${hex8}`;
}

const CONFIG = {
    channelName:     params.get('channel'),
    fontSize:        params.get('fontSize'),
    shadowColor:     params.get('shadow'),
    showToastEmotes: params.get('toastEmotes') !== '0',
    // Per-type event toggles
    showSubs:        params.get('showSubs')        !== '0',
    showBits:        params.get('showBits')        !== '0',
    showRedeems:     params.get('showRedeems')     !== '0',
    showHighlights:  params.get('showHighlights')  !== '0',
    showStreaks:     params.get('showStreaks')      !== '0',
    // Per-type labels (empty = use default)
    subLabel:        params.get('subLabel')        || '',
    bitsLabel:       params.get('bitsLabel')       || '',
    redeemLabel:     params.get('redeemLabel')     || '',
    streakLabel:     params.get('streakLabel')     || '',
    // Badge options
    disableAllBadges:      params.get('disableAllBadges')      === '1',
    roleOnlyBadges:        params.get('roleOnlyBadges')        === '1',
    showExternalCosmetics: params.get('showExternalCosmetics') !== '0',
    clientId: 'ti9ahr6lkym6anpij3d4f2cyjhij18',
    token:    params.get('token') || localStorage.getItem('twitch_access_token'),
};

// Apply CSS variables
if (CONFIG.fontSize)    document.documentElement.style.setProperty('--chat-font-size',    CONFIG.fontSize);
if (CONFIG.shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', hex8ToCss(CONFIG.shadowColor, '#000000FF'));

// Event type color CSS variables
const cssVars = {
    '--sub-accent':       hex8ToCss(params.get('subAccent'),       '#9146FFFF'),
    '--sub-bg':           hex8ToCss(params.get('subBg'),           '#1a0a2eCC'),
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

// Badges that are strictly tied to channel role
const ROLE_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff', 'admin', 'global_mod', 'lead_moderator']);