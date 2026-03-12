// ─── badges/badgeMap.js ───────────────────────────────────────────────────────
// Shared Twitch badge registry and badge rendering logic.
// Badge keys follow the format "set/version" e.g. "subscriber/6" or "bits/1000".
// All badge providers (Twitch, FFZ, Chatterino) write into this or their own maps,
// and renderBadges() reads from all of them to build the final badge HTML.

// "set/version" → image URL for Twitch badges
const badgeMap = {};

// ── Shared chat source channel avatars ────────────────────────────────────────
// Twitch sends source-room-id / source-room-login on every shared chat message
// from a guest channel. We show the guest channel's profile picture as a small
// circular badge before the user's regular badges.
//
// Avatars are fetched lazily on first sight of a room ID and cached for the
// session. A null sentinel prevents duplicate in-flight fetches. Once resolved,
// any <img> elements already in the DOM with that data-source-room-id get their
// src patched in — the same pattern as 7TV cosmetics.

// roomId → { url, login } after fetch, null while fetch is in flight
const _sourceAvatarCache = {};

async function _fetchSourceAvatar(roomId, login) {
    // Sentinel — already fetching or already done
    if (roomId in _sourceAvatarCache) return;
    _sourceAvatarCache[roomId] = null;

    if (!CONFIG.token || !CONFIG.clientId) return;

    try {
        const res = await fetch(
            `https://api.twitch.tv/helix/users?id=${encodeURIComponent(roomId)}`,
            { headers: { 'Authorization': `Bearer ${CONFIG.token}`, 'Client-Id': CONFIG.clientId } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const user = data.data?.[0];
        if (!user?.profile_image_url) return;

        _sourceAvatarCache[roomId] = { url: user.profile_image_url, login: user.display_name || login };

        // Patch any badge imgs already in the DOM that are still showing the placeholder
        document.querySelectorAll(`.source-channel-badge[data-source-room-id="${CSS.escape(roomId)}"]`)
            .forEach(img => {
                img.src   = user.profile_image_url;
                img.title = `From ${escapeHTML(user.display_name || login)}'s chat`;
                img.alt   = user.display_name || login;
            });
    } catch (e) {
        console.warn('[SharedChat] Could not fetch avatar for', login, e);
    }
}

function renderBadges(tags) {
    let html = '';

    // Kill switch — return nothing if all badges are disabled
    if (CONFIG.disableAllBadges) return html;

    // ── Shared chat source badge ───────────────────────────────────────────────
    // Compare source-room-id against broadcasterId (set in main.js on roomstate)
    // so messages from the host channel never get the badge.
    const sourceRoomId    = tags['source-room-id'];
    const sourceRoomLogin = tags['source-room-login'];
    if (sourceRoomId && sourceRoomLogin && String(sourceRoomId) !== String(broadcasterId)) {
        const safeLogin = sourceRoomLogin.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        const cached    = _sourceAvatarCache[sourceRoomId];
        const avatarUrl = cached?.url || '';
        const label     = cached?.login || safeLogin;

        // Kick off the avatar fetch if we haven't seen this room before.
        // Fire-and-forget — the DOM patch above handles updating existing imgs.
        if (!(sourceRoomId in _sourceAvatarCache)) {
            _fetchSourceAvatar(sourceRoomId, safeLogin);
        }

        // Render the img immediately — src is blank until the fetch resolves,
        // at which point _fetchSourceAvatar patches it in.
        html += `<img class="chat-badge source-channel-badge"`
              + ` src="${escapeHTML(avatarUrl)}"`
              + ` data-source-room-id="${escapeHTML(sourceRoomId)}"`
              + ` alt="${escapeHTML(label)}"`
              + ` title="From ${escapeHTML(label)}'s chat"`
              + ` width="18" height="18">`;
    }

    // Twitch badges — tags.badges is pre-parsed by tmi.js: { broadcaster: '1', subscriber: '6', ... }
    if (tags.badges) {
        for (const [setName, version] of Object.entries(tags.badges)) {
            // Skip non-role badges when roleOnlyBadges is active
            if (CONFIG.roleOnlyBadges && !ROLE_BADGES.has(setName)) continue;
            const url = badgeMap[`${setName}/${version}`];
            if (url) {
                html += `<img class="chat-badge" src="${url}" alt="${escapeHTML(setName)}" title="${escapeHTML(setName)}" width="18" height="18">`;
            }
        }
    }

    // FFZ and Chatterino badges — shown unless external cosmetics are disabled.
    // These are keyed by Twitch user ID, not login name.
    if (CONFIG.showExternalCosmetics && tags.username) {
        const key = tags['user-id'] ? String(tags['user-id']) : null;

        const ffzBadges = key ? ffzUserBadges[key] : null;
        if (ffzBadges) {
            for (const badge of ffzBadges) {
                html += `<img class="chat-badge ffz-badge" src="${badge.url}" alt="${escapeHTML(badge.title)}" title="${escapeHTML(badge.title)}" width="18" height="18">`;
            }
        }

        const chatterinoBadges = tags['user-id'] ? chatterinoUserBadges[String(tags['user-id'])] : null;
        if (chatterinoBadges) {
            for (const badge of chatterinoBadges) {
                html += `<img class="chat-badge chatterino-badge" src="${badge.url}" alt="${escapeHTML(badge.title)}" title="${escapeHTML(badge.title)}" width="18" height="18">`;
            }
        }
    }

    return html;
}