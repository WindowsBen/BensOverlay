// ─── config.js ────────────────────────────────────────────────────────────────
// Reads all URL parameters and exposes them as named constants.
// Every other file imports from here — nothing reads params directly.

const params = new URLSearchParams(window.location.hash.substring(1));

const CONFIG = {
    channelName:     params.get('channel'),
    fontSize:        params.get('fontSize'),
    shadowColor:     params.get('shadow'),
    showToastAdd:    params.get('toastAdd')        !== '0',
    showToastRemove: params.get('toastRemove')     !== '0',
    // Per-type event toggles
    showSubs:        params.get('showSubs')        !== '0',
    showBits:        params.get('showBits')        !== '0',
    showRedeems:     params.get('showRedeems')     !== '0',
    showHighlights:  params.get('showHighlights')  !== '0',
    // Per-type labels (empty = use default)
    subLabel:        params.get('subLabel')        || '',
    bitsLabel:       params.get('bitsLabel')       || '',
    redeemLabel:     params.get('redeemLabel')     || '',
    // Badge options
    disableAllBadges:      params.get('disableAllBadges')      === '1',
    roleOnlyBadges:        params.get('roleOnlyBadges')        === '1',
    showExternalCosmetics: params.get('showExternalCosmetics') !== '0',
    clientId: 'ti9ahr6lkym6anpij3d4f2cyjhij18',
    token:    params.get('token') || localStorage.getItem('twitch_access_token'),
};

// Apply CSS variables immediately
if (CONFIG.fontSize)    document.documentElement.style.setProperty('--chat-font-size',    CONFIG.fontSize);
if (CONFIG.shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', CONFIG.shadowColor);

// Event type color CSS variables
const cssVars = {
    '--sub-accent':       params.get('subAccent')       || 'rgba(145,70,255,1.00)',
    '--sub-bg':           params.get('subBg')           || 'rgba(26,10,46,0.80)',
    '--bits-accent':      params.get('bitsAccent')      || 'rgba(145,70,255,1.00)',
    '--bits-bg':          params.get('bitsBg')          || 'rgba(26,10,46,0.80)',
    '--redeem-accent':    params.get('redeemAccent')    || 'rgba(255,184,0,1.00)',
    '--redeem-bg':        params.get('redeemBg')        || 'rgba(42,31,0,0.80)',
    '--highlight-accent': params.get('highlightAccent') || 'rgba(255,0,255,1.00)',
    '--highlight-bg':     params.get('highlightBg')     || 'rgba(42,0,42,0.80)',
};
for (const [key, val] of Object.entries(cssVars)) {
    document.documentElement.style.setProperty(key, val);
}

// Badges that are strictly tied to channel role
const ROLE_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff', 'admin', 'global_mod', 'lead_moderator']);