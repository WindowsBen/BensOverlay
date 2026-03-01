// ─── emotes/ffz.js ────────────────────────────────────────────────────────────
// Fetches FFZ channel + global emotes. Emotes with modifier:true are tracked
// in ffzModifierEmotes and handled like zero-width overlays in the parser.

function registerFFZEmotes(emotes) {
    for (const emote of emotes) {
        const url = emote.urls?.['1'] || `https://cdn.frankerfacez.com/emote/${emote.id}/1`;
        emoteMap[emote.name] = url;
        if (emote.modifier) {
            ffzModifierEmotes.add(emote.name);
        }
    }
}

async function fetchFFZEmotes(twitchUserId) {
    try {
        // Global emotes
        const globalRes = await fetch('https://api.frankerfacez.com/v1/set/global');
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            let count = 0;
            for (const set of Object.values(globalData.sets || {})) {
                registerFFZEmotes(set.emoticons || []);
                count += (set.emoticons || []).length;
            }
            console.log(`[FFZ] Loaded ${count} global emotes`);
        }

        // Channel emotes
        const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
        if (!res.ok) { console.warn('[FFZ] Channel not found'); return; }

        const data = await res.json();
        let count = 0;
        for (const set of Object.values(data.sets || {})) {
            registerFFZEmotes(set.emoticons || []);
            count += (set.emoticons || []).length;
        }
        console.log(`[FFZ] Loaded ${count} channel emotes`);
    } catch (err) {
        console.error('[FFZ] Failed to fetch emotes:', err);
    }
}