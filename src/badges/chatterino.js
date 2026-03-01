// ─── badges/chatterino.js ─────────────────────────────────────────────────────
// Fetches Chatterino badge definitions from api.chatterino.com.
// Structure: { badges: [{ tooltip, image1, image2, image3, users: [twitchId, ...] }] }
// Keyed by Twitch user ID (tags['user-id']) so no login name lookup needed.

// twitchUserId (string) → array of { url, title }
const chatterinoUserBadges = {};

async function fetchChatterinoBadges() {
    try {
        const res = await fetch('https://api.chatterino.com/badges');
        if (!res.ok) { console.warn('[Chatterino Badges] Could not fetch badge list'); return; }

        const data = await res.json();

        for (const badge of data.badges || []) {
            if (!badge.image3 || !badge.users) continue;
            const def = { url: badge.image3, title: badge.tooltip || 'Chatterino Badge' };

            for (const userId of badge.users) {
                const key = String(userId);
                if (!chatterinoUserBadges[key]) chatterinoUserBadges[key] = [];
                chatterinoUserBadges[key].push(def);
            }
        }

        console.log(`[Chatterino Badges] Loaded badge data for ${Object.keys(chatterinoUserBadges).length} users`);
    } catch (err) {
        console.error('[Chatterino Badges] Failed:', err);
    }
}