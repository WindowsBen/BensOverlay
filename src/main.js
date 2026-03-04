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
    if (tags['message-type'] === 'action') return;
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
// We also use this to catch pinned message events and log all USERNOTICEs
// to help discover what msg-ids fire for manual unpins.
client.on('raw_message', (messageCloned, message) => {
    if (message.command !== 'USERNOTICE') return;
    const tags = message.tags || {};
    const msgId = tags['msg-id'];
    const text  = message.params?.[1] || '';

    if (msgId === 'viewermilestone' && tags['msg-param-category'] === 'watch-streak') {
        handleWatchStreak(tags, text);
    } else if (msgId === 'pinned-chat-update') {
        handlePinnedChatUpdate(tags, text);
    } else if (msgId === 'pinned-chat-remove' || msgId === 'unpin-chat' || msgId === 'moderator-removed-pin') {
        // Try all known/plausible unpin msg-ids — log will reveal the real one
        handlePinnedChatRemove(tags);
    } else if (msgId && msgId.includes('pin')) {
        // Catch any other pin-related events we don't know about yet
        console.log('[unknown pin event]', msgId, tags);
    }
});

client.on('subscription', handleSubscription);
client.on('resub',        handleResub);
client.on('subgift',      handleSubgift);
client.on('submysterygift', handleSubmysterygift);
client.on('cheer',        handleCheer);

registerModerationListeners(client);