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
    // Spacing
    messageGap:      params.get('messageGap')  || '',
    lineHeight:      params.get('lineHeight')  || '',
    // Excluded users — stored as a lowercase Set for O(1) lookup
    excludedUsers:   new Set(
        (params.get('exclude') || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean)
    ),
    // Excluded prefixes — stored as an array of trimmed strings
    excludedPrefixes: (params.get('excludePrefix') || '').split(',').map(p => p.trim()).filter(Boolean),
    showReplies:      params.get('showReplies') !== '0',
    meStyle:          params.get('meStyle') || 'colored',
    // Per-type event toggles
    showResubs:      params.get('showResubs')      !== '0' && params.get('showResubs') === '1',
    showGifts:       params.get('showGifts')       !== '0' && params.get('showGifts')  === '1',
    showBits:        params.get('showBits')        !== '0' && params.get('showBits')   === '1',
    showRedeems:     params.get('showRedeems')     !== '0' && params.get('showRedeems') === '1',
    showHighlights:  params.get('showHighlights')  !== '0' && params.get('showHighlights') === '1',
    showStreaks:     params.get('showStreaks')      !== '0' && params.get('showStreaks') === '1',
    // Per-type labels (empty = use default)
    resubLabel:      params.get('resubLabel')      || '',
    giftLabel:       params.get('giftLabel')       || '',
    bitsLabel:       params.get('bitsLabel')       || '',
    redeemLabel:     params.get('redeemLabel')     || '',
    streakLabel:     params.get('streakLabel')     || '',
    // Font
    fontUrl:         params.get('fontUrl')         || '',
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
if (CONFIG.messageGap)  document.documentElement.style.setProperty('--message-gap',       CONFIG.messageGap + 'px');
if (CONFIG.lineHeight)  document.documentElement.style.setProperty('--message-line-height', CONFIG.lineHeight);

// Load custom font if provided — extract font-family name from the CSS itself
if (CONFIG.fontUrl) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = CONFIG.fontUrl;
    document.head.appendChild(link);

    // Fetch the CSS and pull the first font-family name out of it
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

// Event type color CSS variables
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

// Badges that are strictly tied to channel role
const ROLE_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff', 'admin', 'global_mod', 'lead_moderator']);