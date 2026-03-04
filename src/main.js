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
    if (tags['custom-reward-id']) {
        handleRedemption(broadcasterId, tags, message);
    } else {
        displayMessage(tags, message);
    }
});

// USERNOTICE events not handled by tmi.js named events (e.g. viewermilestone)
client.on('usernotice', (msgid, channel, tags, message) => {
    console.log('[usernotice]', { msgid, channel, tags, message });
    if (msgid === 'viewermilestone' && tags['msg-param-category'] === 'watch-streak') {
        handleWatchStreak(tags, message);
    }
});

client.on('subscription', handleSubscription);
client.on('resub',        handleResub);
client.on('subgift',      handleSubgift);
client.on('submysterygift', handleSubmysterygift);
client.on('cheer',        handleCheer);

registerModerationListeners(client);