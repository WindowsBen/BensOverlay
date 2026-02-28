// ─── badges/badgeMap.js ───────────────────────────────────────────────────────
// Shared badge registry and badge rendering.
// "set/version" → image URL  e.g. "subscriber/6" → "https://..."

const badgeMap = {};

function renderBadges(tags) {
    let html = '';

    // Twitch badges — tags.badges is already parsed by tmi.js: { broadcaster: '1', subscriber: '6', ... }
    if (tags.badges) {
        for (const [setName, version] of Object.entries(tags.badges)) {
            if (CONFIG.roleOnlyBadges && !ROLE_BADGES.has(setName)) continue;
            const url = badgeMap[`${setName}/${version}`];
            if (url) {
                html += `<img class="chat-badge" src="${url}" alt="${escapeHTML(setName)}" title="${escapeHTML(setName)}">`;
            }
        }
    }

    // FFZ badges — keyed by login name, gated by showExternalCosmetics
    if (CONFIG.showExternalCosmetics && tags.username) {
        const key = tags.username.toLowerCase();
        const ffzBadges = ffzUserBadges[key];
        if (ffzBadges) {
            for (const badge of ffzBadges) {
                html += `<img class="chat-badge ffz-badge" src="${badge.url}" alt="${escapeHTML(badge.title)}" title="${escapeHTML(badge.title)}">`;
            }
        }
    }

    return html;
}