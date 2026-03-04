// ─── main.js ──────────────────────────────────────────────────────────────────
// Entry point. Connects to Twitch chat via tmi.js and wires all modules together.

if (!CONFIG.channelName) {
    document.body.innerHTML = "<h2 style='color:red;'>Error: No channel specified in URL</h2>";
    throw new Error('No channel specified');
}

const client = new tmi.Client({
    connection: { secure: true, reconnect: true },
    channels: [CONFIG.channelName],
});

client.connect();

let broadcasterId = null;

client.on('roomstate', (channel, state) => {
    const twitchUserId = state['room-id'];
    if (!twitchUserId) return;
    broadcasterId = twitchUserId;

    Promise.all([
        fetchFFZEmotes(twitchUserId),
        fetchBTTVEmotes(twitchUserId),
        fetch7TVEmotes(twitchUserId),
        fetchTwitchBadges(twitchUserId),
        fetchFFZBadges(),
        fetchChatterinoBadges(),
        fetchCheermotes(twitchUserId),
    ]).then(() => {
        console.log(`[Init] Ready. Emotes: ${Object.keys(emoteMap).length}, Badges: ${Object.keys(badgeMap).length}`);
    });
});

client.on('message', (channel, tags, message, self) => {
    // tmi.js fires both 'message' and 'action' for /me — skip here to avoid double render
    console.log('[message]', tags['message-type'], message.slice(0, 30));
    if (message.startsWith('\x01ACTION')) return;
    if (tags['custom-reward-id']) {
        handleRedemption(broadcasterId, tags, message);
    } else {
        displayMessage(tags, message);
    }
});

client.on('action', (channel, tags, message, self) => {
    displayMessage(tags, message, true);
});

// viewermilestone (watch streaks) doesn't surface through tmi.js named events,
// so we intercept it at the raw IRC level instead.
client.on('raw_message', (messageCloned, message) => {
    if (message.command !== 'USERNOTICE') return;
    const tags = message.tags || {};
    if (tags['msg-id'] === 'viewermilestone' && tags['msg-param-category'] === 'watch-streak') {
        const text = message.params?.[1] || '';
        handleWatchStreak(tags, text);
    }
});

client.on('subscription', handleSubscription);
client.on('resub',        handleResub);
client.on('subgift',      handleSubgift);
client.on('submysterygift', handleSubmysterygift);
client.on('cheer',        handleCheer);

registerModerationListeners(client);