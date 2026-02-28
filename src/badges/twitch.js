// ─── badges/twitch.js ─────────────────────────────────────────────────────────
// Fetches global and channel Twitch badges via the Helix API.
// Requires a valid accessToken and clientId from CONFIG.

async function fetchTwitchBadges(channelId) {
    if (!CONFIG.clientId || !CONFIG.accessToken) {
        console.warn('[Badges] No clientId or token — skipping Twitch badge fetch.');
        return;
    }

    const headers = {
        'Authorization': `Bearer ${CONFIG.accessToken}`,
        'Client-Id':     CONFIG.clientId,
    };

    try {
        // Global badges (admin, staff, turbo, Prime, bits, etc.)
        const globalRes = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            for (const set of globalData.data || []) {
                for (const version of set.versions || []) {
                    badgeMap[`${set.set_id}/${version.id}`] = version.image_url_1x;
                }
            }
            console.log('[Badges] Loaded global Twitch badges');
        } else if (globalRes.status === 401) {
            console.warn('[Badges] Token expired — re-authenticate in the configurator');
            return;
        }

        // Channel badges (subscriber tiers, bits tiers, custom badges)
        // Overwrites globals with same key so channel-specific icons always win
        const channelRes = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${channelId}`, { headers });
        if (channelRes.ok) {
            const channelData = await channelRes.json();
            for (const set of channelData.data || []) {
                for (const version of set.versions || []) {
                    badgeMap[`${set.set_id}/${version.id}`] = version.image_url_1x;
                }
            }
            console.log('[Badges] Loaded channel Twitch badges');
        }
    } catch (err) {
        console.error('[Badges] Failed to fetch Twitch badges:', err);
    }
}