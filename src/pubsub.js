// ─── pubsub.js ────────────────────────────────────────────────────────────────
// Connects to Twitch PubSub to receive ALL channel point redemptions,
// including those without text input which never arrive over IRC.
//
// PubSub is Twitch's legacy real-time pub/sub system. It requires the
// channel:read:redemptions scope on the OAuth token, which we already
// request. EventSub WebSocket would be the modern alternative but requires
// a user access token and more complex subscription management.
//
// Flow:
//   1. Connect to wss://pubsub-edge.twitch.tv
//   2. LISTEN on channel-points-channel-v1.<broadcasterId>
//   3. Send a PING every 4 minutes to keep the connection alive
//   4. On PONG timeout or error, reconnect with exponential backoff
//   5. On redemption message, call handlePubSubRedemption()

let _pubsubWS          = null;
let _pubsubPingTimer   = null;
let _pubsubPongTimer   = null;
let _pubsubReconnectMs = 1000;   // starts at 1s, doubles up to 120s
let _pubsubChannelId   = null;

function connectPubSub(channelId) {
    if (!CONFIG.token) return;
    if (!CONFIG.showRedeems) return;
    _pubsubChannelId = channelId;

    _pubsubWS = new WebSocket('wss://pubsub-edge.twitch.tv');

    _pubsubWS.onopen = () => {
        console.log('[PubSub] Connected');
        _pubsubReconnectMs = 1000; // reset backoff on successful connect

        // Subscribe to channel point redemptions
        _pubsubWS.send(JSON.stringify({
            type: 'LISTEN',
            nonce: 'cp_' + Date.now(),
            data: {
                topics: [`channel-points-channel-v1.${channelId}`],
                auth_token: CONFIG.token
            }
        }));

        schedulePubSubPing();
    };

    _pubsubWS.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'PONG') {
            // Clear the pong timeout — connection is alive
            clearTimeout(_pubsubPongTimer);
            return;
        }

        if (msg.type === 'RECONNECT') {
            // Twitch asked us to reconnect
            console.log('[PubSub] Server requested reconnect');
            reconnectPubSub();
            return;
        }

        if (msg.type === 'RESPONSE') {
            if (msg.error) {
                console.warn('[PubSub] LISTEN error:', msg.error);
            } else {
                console.log('[PubSub] Listening for channel point redemptions');
            }
            return;
        }

        if (msg.type === 'MESSAGE') {
            handlePubSubMessage(msg.data);
        }
    };

    _pubsubWS.onerror = (err) => {
        console.warn('[PubSub] WebSocket error:', err);
    };

    _pubsubWS.onclose = () => {
        console.log('[PubSub] Disconnected — reconnecting in', _pubsubReconnectMs, 'ms');
        clearTimeout(_pubsubPingTimer);
        clearTimeout(_pubsubPongTimer);
        setTimeout(() => connectPubSub(_pubsubChannelId), _pubsubReconnectMs);
        _pubsubReconnectMs = Math.min(_pubsubReconnectMs * 2, 120_000);
    };
}

function schedulePubSubPing() {
    // Twitch requires a PING at least every 5 minutes; we use 4 to be safe
    _pubsubPingTimer = setTimeout(() => {
        if (_pubsubWS?.readyState !== WebSocket.OPEN) return;
        _pubsubWS.send(JSON.stringify({ type: 'PING' }));

        // If we don't get a PONG within 10 seconds, reconnect
        _pubsubPongTimer = setTimeout(() => {
            console.warn('[PubSub] PONG timeout — reconnecting');
            reconnectPubSub();
        }, 10_000);

        schedulePubSubPing(); // schedule the next ping
    }, 4 * 60 * 1000);
}

function reconnectPubSub() {
    clearTimeout(_pubsubPingTimer);
    clearTimeout(_pubsubPongTimer);
    if (_pubsubWS) {
        _pubsubWS.onclose = null; // prevent the onclose handler from double-reconnecting
        _pubsubWS.close();
    }
    connectPubSub(_pubsubChannelId);
}

function handlePubSubMessage(data) {
    if (!data?.topic?.startsWith('channel-points-channel-v1.')) return;

    let inner;
    try { inner = JSON.parse(data.message); } catch { return; }

    if (inner.type !== 'reward-redeemed') return;

    const redemption = inner.data?.redemption;
    if (!redemption) return;

    const rewardId   = redemption.reward?.id;
    const rewardName = redemption.reward?.title || 'Channel Point Reward';
    const username   = redemption.user?.display_name || redemption.user?.login || '';
    const userInput  = redemption.user_input || '';

    // Cache the reward name so getRewardName() doesn't need to fetch it
    if (rewardId) rewardNameCache[rewardId] = rewardName;

    handlePubSubRedemption(rewardId, rewardName, username, userInput);
}