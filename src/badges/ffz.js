// ─── badges/ffz.js ────────────────────────────────────────────────────────────
// Fetches FFZ badge definitions from api.frankerfacez.com/v1/badges/ids.
// Keyed by Twitch user ID (tags['user-id']) — no login name lookup needed.

// twitchUserId (string) → array of { url, title }
const ffzUserBadges = {};

async function fetchFFZBadges() {
    try {
        const res = await fetch('https://api.frankerfacez.com/v1/badges/ids');
        if (!res.ok) { console.warn('[FFZ Badges] Could not fetch badge list'); return; }

        const data = await res.json();

        // Build badge id → { url, title } lookup
        const badgeDefs = {};
        for (const badge of data.badges || []) {
            if (!badge.urls && !badge.image) continue;
            const url = badge.urls?.['4'] || badge.urls?.['2'] || badge.urls?.['1'] || badge.image;
            if (!url) continue;
            badgeDefs[badge.id] = { url, title: badge.title || 'FFZ Badge' };
        }

        // Invert users map: twitchUserId → [badge defs]
        for (const [badgeId, userIds] of Object.entries(data.users || {})) {
            const def = badgeDefs[badgeId];
            if (!def) continue;
            for (const userId of userIds) {
                const key = String(userId);
                if (!ffzUserBadges[key]) ffzUserBadges[key] = [];
                ffzUserBadges[key].push(def);
            }
        }

        console.log(`[FFZ Badges] Loaded badge data for ${Object.keys(ffzUserBadges).length} users`);
    } catch (err) {
        console.error('[FFZ Badges] Failed:', err);
    }
}