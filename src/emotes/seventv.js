// ─── emotes/seventv.js ────────────────────────────────────────────────────────
// Fetches 7TV channel emotes and subscribes to live emote set updates.

async function fetch7TVEmotes(twitchUserId) {
    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!res.ok) { console.warn('[7TV] Channel not found on 7TV'); return; }

        const data = await res.json();
        const emotes = data?.emote_set?.emotes;
        if (!emotes) return;

        for (const emote of emotes) {
            emoteMap[emote.name] = `https://cdn.7tv.app/emote/${emote.id}/1x.webp`;
        }
        console.log(`[7TV] Loaded ${emotes.length} emotes`);

        const emoteSetId = data?.emote_set?.id;
        if (emoteSetId) subscribe7TVLiveUpdates(emoteSetId);
    } catch (err) {
        console.error('[7TV] Failed to fetch emotes:', err);
    }
}

function subscribe7TVLiveUpdates(emoteSetId) {
    const ws = new WebSocket('wss://events.7tv.io/v3');

    ws.onopen = () => {
        ws.send(JSON.stringify({
            op: 35,
            d: { type: 'emote_set.update', condition: { object_id: emoteSetId } }
        }));
        console.log('[7TV] Subscribed to live emote updates for set:', emoteSetId);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.op !== 0 || msg.d?.type !== 'emote_set.update') return;

        const { pulled = [], pushed = [], updated = [] } = msg.d?.body || {};

        for (const item of pulled) {
            const name = item.old_value?.name;
            if (name) {
                const url = emoteMap[name];
                delete emoteMap[name];
                console.log(`[7TV] Emote removed: ${name}`);
                if (CONFIG.showToastRemove) showRemovedEmoteToast(name, url);
            }
        }

        for (const item of pushed) {
            const { name, id } = item.value || {};
            if (name && id) {
                const url = `https://cdn.7tv.app/emote/${id}/1x.webp`;
                emoteMap[name] = url;
                console.log(`[7TV] Emote added: ${name}`);
                if (CONFIG.showToastAdd) showNewEmoteToast(name, url);
            }
        }

        for (const item of updated) {
            if (item.old_value?.name) delete emoteMap[item.old_value.name];
            const { name, id } = item.value || {};
            if (name && id) {
                emoteMap[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`;
                console.log(`[7TV] Emote updated: ${name}`);
            }
        }
    };

    ws.onclose = () => {
        console.warn('[7TV] WebSocket closed — reconnecting in 5s...');
        setTimeout(() => subscribe7TVLiveUpdates(emoteSetId), 5000);
    };

    ws.onerror = (err) => console.error('[7TV] WebSocket error:', err);
}