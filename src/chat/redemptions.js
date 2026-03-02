// ─── chat/redemptions.js ──────────────────────────────────────────────────────
// Handles channel point redemptions that have text input.
// Reward names are fetched from Helix on first encounter and cached.
// Falls back to showing the reward ID if the fetch fails.

// rewardId → name string (or the ID itself as fallback)
const rewardNameCache = {};
// rewardId → true if a fetch is already in flight
const rewardFetchPending = {};

async function getRewardName(broadcasterId, rewardId) {
    if (rewardNameCache[rewardId]) return rewardNameCache[rewardId];

    // If already fetching, wait briefly and retry
    if (rewardFetchPending[rewardId]) {
        await new Promise(r => setTimeout(r, 500));
        return rewardNameCache[rewardId] || rewardId;
    }

    if (!CONFIG.token || !CONFIG.clientId) {
        rewardNameCache[rewardId] = rewardId;
        return rewardId;
    }

    rewardFetchPending[rewardId] = true;
    try {
        const res = await fetch(
            `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}&id=${rewardId}`,
            { headers: { 'Authorization': `Bearer ${CONFIG.token}`, 'Client-Id': CONFIG.clientId } }
        );
        if (res.ok) {
            const data = await res.json();
            const name = data.data?.[0]?.title;
            rewardNameCache[rewardId] = name || 'Channel Point Reward';
        } else {
            // 401/403 = not the broadcaster's token, can't read rewards
            rewardNameCache[rewardId] = 'Channel Point Reward';
        }
    } catch {
        rewardNameCache[rewardId] = 'Channel Point Reward';
    }
    delete rewardFetchPending[rewardId];
    return rewardNameCache[rewardId];
}

async function handleRedemption(broadcasterId, tags, message) {
    if (!CONFIG.showRedeems) return;

    const rewardId   = tags['custom-reward-id'];
    if (!rewardId) return;

    const rewardName = await getRewardName(broadcasterId, rewardId);
    const username   = tags['display-name'] || tags.username;
    const verb       = CONFIG.redeemLabel || 'redeemed';

    const ICON_REDEEM = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 11H9V9h2v4zm0-6H9V5h2v2z"/></svg>`;

    const container = document.getElementById('chat-container');
    const el = document.createElement('div');
    el.className = 'chat-message event-message redemption-message';

    const parsedInput = message
        ? `<span class="event-user-message">${parseMessage(message, tags.emotes)}</span>`
        : '';

    el.innerHTML = `
        <span class="event-icon redemption-icon">${ICON_REDEEM}</span>
        <span class="event-body">
            <span class="event-label">${escapeHTML(username)}</span>
            <span class="event-detail">${escapeHTML(verb)} <strong>${escapeHTML(rewardName)}</strong></span>
            ${parsedInput}
        </span>`;

    container.appendChild(el);
    if (container.childNodes.length > 50) container.removeChild(container.firstChild);
}