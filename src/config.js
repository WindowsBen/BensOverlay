// ─── config.js ────────────────────────────────────────────────────────────────
// Reads all URL parameters and exposes them as named constants.
// Every other file imports from here — nothing reads params directly.

const params = new URLSearchParams(window.location.search);

const CONFIG = {
    channelName:     params.get('channel'),
    fontSize:        params.get('fontSize'),
    shadowColor:     params.get('shadow'),
    showToastAdd:    params.get('toastAdd')        !== '0',
    showToastRemove: params.get('toastRemove')     !== '0',
    roleOnlyBadges:  params.get('roleOnlyBadges')  === '1',
    clientId:        'ti9ahr6lkym6anpij3d4f2cyjhij18',
    accessToken:     params.get('token') || localStorage.getItem('twitch_access_token'),
};

// Apply CSS variables immediately
if (CONFIG.fontSize)    document.documentElement.style.setProperty('--chat-font-size',    CONFIG.fontSize);
if (CONFIG.shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', CONFIG.shadowColor);

// Badges that are strictly tied to channel role — always shown even in role-only mode
const ROLE_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff', 'admin', 'global_mod']);