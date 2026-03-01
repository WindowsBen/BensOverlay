// ─── badges/chatterino.js ─────────────────────────────────────────────────────
// Fetches Chatterino badge definitions from fourtf.com.
// Structure: { badges: [{ tooltip, image, users: [loginName, ...] }] }

// loginName (lowercase) → array of { url, title }
const chatterinoUserBadges = {};

async function fetchChatterinoBadges() {
    try {
        const res = await fetch('https://api.chatterino.com/badges');
        if (!res.ok) { console.warn('[Chatterino Badges] Could not fetch badge list'); return; }

        const data = await res.json();

        for (const badge of data.badges || []) {
            if (!badge.image || !badge.users) continue;
            const def = { url: badge.image, title: badge.tooltip || 'Chatterino Badge' };

            for (const loginName of badge.users) {
                // Some entries are "$name_not_loaded" — skip them
                if (!loginName || loginName.startsWith('$')) continue;
                const key = loginName.toLowerCase();
                if (!chatterinoUserBadges[key]) chatterinoUserBadges[key] = [];
                chatterinoUserBadges[key].push(def);
            }
        }

        console.log(`[Chatterino Badges] Loaded badge data for ${Object.keys(chatterinoUserBadges).length} users`);
    } catch (err) {
        console.error('[Chatterino Badges] Failed:', err);
    }
}