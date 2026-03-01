// ─── emotes/ffz.js ────────────────────────────────────────────────────────────
// Fetches FFZ channel + global emotes.

function ffzEmoteUrl(emote) {
    return emote.urls?.['4'] || emote.urls?.['2'] || emote.urls?.['1']
        || `https://cdn.frankerfacez.com/emote/${emote.id}/4`;
}

async function fetchFFZEmotes(twitchUserId) {
    try {
        // Global emotes
        const globalRes = await fetch('https://api.frankerfacez.com/v1/set/global');
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            let count = 0;
            for (const set of Object.values(globalData.sets || {})) {
                for (const emote of set.emoticons || []) {
                    emoteMap[emote.name] = ffzEmoteUrl(emote);
                    count++;
                }
            }
            console.log(`[FFZ] Loaded ${count} global emotes`);
        }

        // Channel emotes
        const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
        if (!res.ok) { console.warn('[FFZ] Channel not found'); return; }

        const data = await res.json();
        let count = 0;
        for (const set of Object.values(data.sets || {})) {
            for (const emote of set.emoticons || []) {
                emoteMap[emote.name] = ffzEmoteUrl(emote);
                count++;
            }
        }
        console.log(`[FFZ] Loaded ${count} channel emotes`);
    } catch (err) {
        console.error('[FFZ] Failed to fetch emotes:', err);
    }
}