// ─── chat/redemptions.js ──────────────────────────────────────────────────────
// Handles channel point redemptions.
//
// Text-input redeems arrive via IRC (tmi.js 'message' event with custom-reward-id).
// All redeems — including those without text input — also arrive via Twitch PubSub
// (src/pubsub.js). The PubSub path is preferred since it catches everything;
// the IRC path is kept as a fallback in case PubSub hasn't connected yet.
//
// To avoid double-rendering, we track recently shown reward redemptions by a
// key of rewardId+username and suppress duplicates within a short window.

// rewardId → name string (or the ID itself as fallback)
const rewardNameCache = {};
// rewardId → true if a fetch is already in flight
const rewardFetchPending = {};

// Two separate dedup stores with different TTLs:
//
//  recentRedemptionIds   — keyed by Twitch's unique redemption UUID.
//                          Long TTL (5 min) so status-transition re-fires
//                          (UNFULFILLED → FULFILLED, streamer fulfils 60s later)
//                          don't render a second time.
//
//  recentRedemptionRace  — keyed by "rewardId:username".
//                          Short TTL (5s) — only exists to handle the IRC/PubSub
//                          race where both paths fire within milliseconds for the
//                          same text-input redeem.
const recentRedemptionIds  = {};  // redemptionId  → timestamp
const recentRedemptionRace = {};  // rewardId:user → timestamp

const REDEEM_ID_TTL   = 5 * 60 * 1000;  // 5 minutes  — covers any fulfil delay
const REDEEM_RACE_TTL = 5 * 1000;        // 5 seconds  — IRC vs PubSub overlap

// Periodically evict expired entries so the maps don't grow indefinitely
setInterval(() => {
    const now = Date.now();
    for (const k in recentRedemptionIds)  if (now - recentRedemptionIds[k]  > REDEEM_ID_TTL)   delete recentRedemptionIds[k];
    for (const k in recentRedemptionRace) if (now - recentRedemptionRace[k] > REDEEM_RACE_TTL) delete recentRedemptionRace[k];
}, 60 * 1000);

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

function renderRedemption(username, rewardName, userInput) {
    const verb = CONFIG.redeemLabel || 'redeemed';

    const ICON_REDEEM = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 11H9V9h2v4zm0-6H9V5h2v2z"/></svg>`;

    const container = document.getElementById('chat-container');
    const el = document.createElement('div');
    el.className = 'chat-message event-message redemption-message';

    const parsedInput = userInput
        ? `<span class="event-user-message">${parseMessage(userInput, null)}</span>`
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

    if (CONFIG.messageLifetime > 0) {
        setTimeout(() => {
            el.classList.add('fading-out');
            setTimeout(() => el.remove(), parseInt(CONFIG.fadeDuration) || 1000);
        }, CONFIG.messageLifetime);
    }
}

// Called from IRC path (text-input redeems only)
async function handleRedemption(broadcasterId, tags, message) {
    if (!CONFIG.showRedeems) return;

    const rewardId = tags['custom-reward-id'];
    if (!rewardId) return;

    const username = tags['display-name'] || tags.username || '';
    const raceKey  = `${rewardId}:${username.toLowerCase()}`;
    const now      = Date.now();

    // Bail immediately if PubSub already rendered before we started
    if (recentRedemptionRace[raceKey] && now - recentRedemptionRace[raceKey] < REDEEM_RACE_TTL) return;

    // Stamp the race key so a concurrent IRC duplicate is suppressed
    recentRedemptionRace[raceKey] = now;

    const rewardName = await getRewardName(broadcasterId, rewardId);

    // Second check — PubSub may have fired and updated the race key during the
    // await above. If its timestamp is newer than ours, it won the race — skip.
    if (recentRedemptionRace[raceKey] !== now) return;

    renderRedemption(username, rewardName, message || '');
}

// Called from PubSub path (all redeems, with and without text input).
// redemptionId is the unique per-event UUID from Twitch — used as the primary
// dedup key. A long TTL ensures that status-update re-fires (e.g. streamer
// fulfils the reward 30 seconds later) never render a second time.
function handlePubSubRedemption(rewardId, rewardName, username, userInput, redemptionId) {
    if (!CONFIG.showRedeems) return;

    const now = Date.now();

    // Dedup by unique redemption ID — blocks any status-transition re-fire
    if (redemptionId) {
        if (recentRedemptionIds[redemptionId] && now - recentRedemptionIds[redemptionId] < REDEEM_ID_TTL) return;
        recentRedemptionIds[redemptionId] = now;
    }

    // Stamp the race key so that if the IRC path is mid-await for the same
    // text-input redeem, its post-await check sees our newer timestamp and skips.
    const raceKey = `${rewardId}:${username.toLowerCase()}`;
    recentRedemptionRace[raceKey] = now;

    renderRedemption(username, rewardName, userInput);
}