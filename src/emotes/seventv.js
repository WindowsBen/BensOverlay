// ─── emotes/seventv.js ────────────────────────────────────────────────────────
// Fetches 7TV channel emotes and subscribes to live emote set updates
// via the shared 7TV WebSocket (seventv-ws.js).
// Zero-width emotes (flags & 1) are tracked in zeroWidthEmotes.

const SEVENTV_ZERO_WIDTH_FLAG = 1;

async function fetch7TVEmotes(twitchUserId) {
    try {
        // Global emotes
        const globalRes = await fetch('https://7tv.io/v3/emote-sets/global');
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            let globalCount = 0;
            for (const emote of globalData.emotes || []) {
                emoteMap[emote.name] = `https://cdn.7tv.app/emote/${emote.id}/1x.webp`;
                if (emote.flags & SEVENTV_ZERO_WIDTH_FLAG) zeroWidthEmotes.add(emote.name);
                globalCount++;
            }
            console.log(`[7TV] Loaded ${globalCount} global emotes`);
        }

        // Channel emotes
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!res.ok) { console.warn('[7TV] Channel not found on 7TV'); return; }

        const data = await res.json();
        const emotes = data?.emote_set?.emotes;
        if (!emotes) return;

        for (const emote of emotes) {
            emoteMap[emote.name] = `https://cdn.7tv.app/emote/${emote.id}/1x.webp`;
            if (emote.flags & SEVENTV_ZERO_WIDTH_FLAG) {
                zeroWidthEmotes.add(emote.name);
            }
        }
        console.log(`[7TV] Loaded ${emotes.length} emotes`);

        const emoteSetId = data?.emote_set?.id;
        if (emoteSetId) {
            subscribe7TV('emote_set.update', emoteSetId, handle7TVEmoteSetUpdate);
        }
    } catch (err) {
        console.error('[7TV] Failed to fetch emotes:', err);
    }
}

function handle7TVEmoteSetUpdate(body) {
    const { pulled = [], pushed = [], updated = [] } = body || {};

    for (const item of pulled) {
        const name = item.old_value?.name;
        if (name) {
            const url = emoteMap[name];
            delete emoteMap[name];
            zeroWidthEmotes.delete(name);
            console.log(`[7TV] Emote removed: ${name}`);
            if (CONFIG.showToastRemove) showRemovedEmoteToast(name, url);
        }
    }

    for (const item of pushed) {
        const { name, id, flags } = item.value || {};
        if (name && id) {
            const url = `https://cdn.7tv.app/emote/${id}/1x.webp`;
            emoteMap[name] = url;
            if (flags & SEVENTV_ZERO_WIDTH_FLAG) zeroWidthEmotes.add(name);
            else zeroWidthEmotes.delete(name);
            console.log(`[7TV] Emote added: ${name}`);
            if (CONFIG.showToastAdd) showNewEmoteToast(name, url);
        }
    }

    for (const item of updated) {
        if (item.old_value?.name) {
            delete emoteMap[item.old_value.name];
            zeroWidthEmotes.delete(item.old_value.name);
        }
        const { name, id, flags } = item.value || {};
        if (name && id) {
            emoteMap[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`;
            if (flags & SEVENTV_ZERO_WIDTH_FLAG) zeroWidthEmotes.add(name);
            else zeroWidthEmotes.delete(name);
            console.log(`[7TV] Emote updated: ${name}`);
        }
    }
}