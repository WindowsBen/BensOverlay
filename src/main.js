// ─── main.js ──────────────────────────────────────────────────────────────────
// Entry point for the overlay. Connects to Twitch IRC via tmi.js and wires
// all event handlers together. Runs after all other scripts have loaded.

if (!CONFIG.channelName) {
    document.body.innerHTML = "<h2 style='color:red;'>Error: No channel specified in URL</h2>";
    throw new Error('No channel specified');
}

const client = new tmi.Client({
    connection: { secure: true, reconnect: true },
    channels: [CONFIG.channelName],
});

client.connect();

// Broadcaster's Twitch user ID — populated on roomstate, used for API calls
let broadcasterId = null;

// roomstate fires when we successfully join the channel.
// We use it to kick off all the emote/badge/cheermote fetches since we need
// the broadcaster's user ID which isn't available until this point.
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

// Regular chat messages and channel point redemptions (which also arrive as PRIVMSG)
client.on('message', (channel, tags, message, self) => {
    // tmi.js fires both 'message' AND 'action' for /me messages — skip here
    // to avoid double-rendering; the 'action' handler below covers these
    if (tags['message-type'] === 'action') return;

    if (tags['custom-reward-id']) {
        // Channel point redemption with text input — tmi.js only emits 'message'
        // for redeems that have text input. No-input redeems are caught via raw_message.
        handleRedemption(broadcasterId, tags, message);
    } else {
        displayMessage(tags, message);
    }
});

// /me messages — tmi.js routes these to 'action' separately from 'message'
client.on('action', (channel, tags, message, self) => {
    displayMessage(tags, message, true); // isAction=true triggers /me styling
});

// Catch channel point redeems that have NO text input — tmi.js does not emit
// a 'message' event for these, but they still arrive as PRIVMSG with a
// custom-reward-id tag and an empty body.
// Watch streaks arrive as USERNOTICE with msg-id="viewermilestone".
// tmi.js doesn't expose a named event for this, so we intercept at the raw
// IRC level. The filter on USERNOTICE keeps this from running on every message.
client.on('raw_message', (messageCloned, message) => {
    if (message.command === 'PRIVMSG') {
        const tags     = message.tags || {};
        const rewardId = tags['custom-reward-id'];
        const body     = message.params?.[1] || '';
        // Only handle if tmi.js won't — i.e. the body is empty (no text input)
        if (rewardId && !body.trim()) {
            // Parse raw IRC badges string into object format for renderBadges
            if (typeof tags.badges === 'string') {
                const parsed = {};
                for (const pair of tags.badges.split(',')) {
                    const [set, version] = pair.split('/');
                    if (set) parsed[set] = version || '1';
                }
                tags.badges = parsed;
            }
            handleRedemption(broadcasterId, tags, '');
        }
        return;
    }

    if (message.command !== 'USERNOTICE') return;
    const tags  = message.tags || {};
    const msgId = tags['msg-id'];
    const text  = message.params?.[1] || '';

    if (msgId === 'viewermilestone' && tags['msg-param-category'] === 'watch-streak') {
        handleWatchStreak(tags, text);
    } else if (msgId === 'announcement') {
        handleAnnouncement(tags, text);
    }
});

// Incoming raid — tmi.js exposes this as a named event
client.on('raided', handleRaidIncoming);

// Subscription events — tmi.js parses these from USERNOTICE into named events
client.on('subscription',    handleSubscription);
client.on('resub',           handleResub);
client.on('subgift',         handleSubgift);
client.on('submysterygift',  handleSubmysterygift);
client.on('cheer',           handleCheer);

// Register ban/timeout/delete listeners
registerModerationListeners(client);