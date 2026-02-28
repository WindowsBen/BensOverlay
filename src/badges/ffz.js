// ─── badges/ffz.js ────────────────────────────────────────────────────────────
// Fetches all FFZ badge definitions and builds a per-user lookup keyed by
// Twitch login name (which tmi.js provides as tags.username).

// loginName (lowercase) → array of { url, title, color }
const ffzUserBadges = {};

async function fetchFFZBadges() {
    try {
        // /v1/badges returns all badge definitions + users map:
        // { badges: [...], users: { badgeId: [loginName, ...] } }
        const res = await fetch('https://api.frankerfacez.com/v1/badges');
        if (!res.ok) { console.warn('[FFZ Badges] Could not fetch badge list'); return; }

        const data = await res.json();

        // Build badge id → { url, title, color } lookup
        const badgeDefs = {};
        for (const badge of data.badges || []) {
            const url = badge.image ? `https:${badge.image}` : null;
            if (url) {
                badgeDefs[badge.id] = {
                    url,
                    title: badge.title || 'FFZ Badge',
                    color: badge.color || null,
                };
            }
        }

        // Invert users map: loginName → [badge defs]
        for (const [badgeId, loginNames] of Object.entries(data.users || {})) {
            const def = badgeDefs[badgeId];
            if (!def) continue;
            for (const loginName of loginNames) {
                const key = loginName.toLowerCase();
                if (!ffzUserBadges[key]) ffzUserBadges[key] = [];
                ffzUserBadges[key].push(def);
            }
        }

        console.log(`[FFZ Badges] Loaded badge data for ${Object.keys(ffzUserBadges).length} users`);
    } catch (err) {
        console.error('[FFZ Badges] Failed:', err);
    }
}