// ─── badges/badgeMap.js ───────────────────────────────────────────────────────
// Shared badge registry and badge rendering.
// "set/version" → image URL  e.g. "subscriber/6" → "https://..."

const badgeMap = {};

function renderBadges(tags) {
    let html = '';

    // Kill switch — return nothing if all badges are disabled
    if (CONFIG.disableAllBadges) return html;

    // Twitch badges — tags.badges is already parsed by tmi.js: { broadcaster: '1', subscriber: '6', ... }
    if (tags.badges) {
        for (const [setName, version] of Object.entries(tags.badges)) {
            if (CONFIG.roleOnlyBadges && !ROLE_BADGES.has(setName)) continue;
            const url = badgeMap[`${setName}/${version}`];
            if (url) {
                html += `<img class="chat-badge" src="${url}" alt="${escapeHTML(setName)}" title="${escapeHTML(setName)}" width="18" height="18">`;
            }
        }
    }

    // FFZ + Chatterino badges — hidden only when external cosmetics are off
    // Independent of roleOnlyBadges — both can be active simultaneously
    if (CONFIG.showExternalCosmetics && tags.username) {
        const key = tags['user-id'] ? String(tags['user-id']) : null;

        const ffzBadges = key ? ffzUserBadges[key] : null;
        if (ffzBadges) {
            for (const badge of ffzBadges) {
                html += `<img class="chat-badge ffz-badge" src="${badge.url}" alt="${escapeHTML(badge.title)}" title="${escapeHTML(badge.title)}" width="18" height="18">`;
            }
        }

        const chatterinoBadges = tags['user-id'] ? chatterinoUserBadges[String(tags['user-id'])] : null;
        if (chatterinoBadges) {
            for (const badge of chatterinoBadges) {
                html += `<img class="chat-badge chatterino-badge" src="${badge.url}" alt="${escapeHTML(badge.title)}" title="${escapeHTML(badge.title)}" width="18" height="18">`;
            }
        }
    }

    return html;
}