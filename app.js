// ─── Read URL Settings ────────────────────────────────────────────────────────
const params      = new URLSearchParams(window.location.search);
const channelName = params.get('channel');
const fontSize    = params.get('fontSize');
const shadowColor = params.get('shadow');
const clientId    = 'ti9ahr6lkym6anpij3d4f2cyjhij18';
const accessToken = params.get('token') || localStorage.getItem('twitch_access_token');

if (fontSize)    document.documentElement.style.setProperty('--chat-font-size', fontSize);
if (shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', shadowColor);

const showToastAdd    = params.get('toastAdd')    !== '0';
const showToastRemove = params.get('toastRemove') !== '0';
const roleOnlyBadges  = params.get('roleOnlyBadges') === '1';

// Badges that are strictly tied to the channel/role — always shown
const ROLE_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff', 'admin', 'global_mod']);

// ─── Emote Registry ───────────────────────────────────────────────────────────
// Single shared map: emote name → image URL
// Load order: FFZ → BTTV → 7TV, so 7TV wins any name conflicts
const emoteMap = {};

// ─── Badge Registry ───────────────────────────────────────────────────────────
// "set/version" → image URL  e.g. "subscriber/6" → "https://..."
const badgeMap = {};

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showNewEmoteToast(emoteName, emoteUrl) {
    const toast = document.createElement('div');
    toast.className = 'emote-toast';
    toast.innerHTML = `
        New Emote added to Set: <strong>${escapeHTML(emoteName)}</strong>
        <img class="toast-emote" src="${escapeHTML(emoteUrl)}" alt="${escapeHTML(emoteName)}">
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('emote-toast--visible')));
    setTimeout(() => {
        toast.classList.remove('emote-toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
}

function showRemovedEmoteToast(emoteName, emoteUrl) {
    const toast = document.createElement('div');
    toast.className = 'emote-toast emote-toast--removed';
    toast.innerHTML = `
        Emote removed from Set: <strong>${escapeHTML(emoteName)}</strong>
        ${emoteUrl ? `<img class="toast-emote" src="${escapeHTML(emoteUrl)}" alt="${escapeHTML(emoteName)}">` : ''}
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('emote-toast--visible')));
    setTimeout(() => {
        toast.classList.remove('emote-toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
}

// ─── Twitch Badges (Helix API) ────────────────────────────────────────────────
async function fetchTwitchBadges(channelId) {
    if (!clientId || !accessToken) {
        console.warn('[Badges] No clientId or token — skipping Twitch badge fetch. Authenticate in the configurator to enable badges.');
        return;
    }

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id':     clientId,
    };

    try {
        // Global badges (admin, staff, turbo, Prime, bits, etc.)
        const globalRes = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            for (const set of globalData.data || []) {
                for (const version of set.versions || []) {
                    badgeMap[`${set.set_id}/${version.id}`] = version.image_url_1x;
                }
            }
            console.log('[Badges] Loaded global Twitch badges');
        } else if (globalRes.status === 401) {
            console.warn('[Badges] Token expired — clear localStorage and re-authenticate in the configurator');
            return;
        }

        // Channel badges (subscriber tiers, bits tiers, custom badges)
        // These overwrite globals with the same key so channel-specific icons always win
        const channelRes = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${channelId}`, { headers });
        if (channelRes.ok) {
            const channelData = await channelRes.json();
            for (const set of channelData.data || []) {
                for (const version of set.versions || []) {
                    badgeMap[`${set.set_id}/${version.id}`] = version.image_url_1x;
                }
            }
            console.log('[Badges] Loaded channel Twitch badges');
        }

    } catch (err) {
        console.error('[Badges] Failed to fetch Twitch badges:', err);
    }
}

// ─── Render Badges HTML ───────────────────────────────────────────────────────
function renderBadges(tags) {
    let html = '';

    // tags.badges is already parsed by tmi.js: { broadcaster: '1', subscriber: '6', ... }
    if (tags.badges) {
        for (const [setName, version] of Object.entries(tags.badges)) {
            if (roleOnlyBadges && !ROLE_BADGES.has(setName)) continue;
            const url = badgeMap[`${setName}/${version}`];
            if (url) {
                html += `<img class="chat-badge" src="${url}" alt="${escapeHTML(setName)}" title="${escapeHTML(setName)}">`;
            }
        }
    }

    return html;
}

// ─── BetterTTV ────────────────────────────────────────────────────────────────
async function fetchBTTVEmotes(twitchUserId) {
    try {
        const globalRes = await fetch('https://api.betterttv.net/3/cached/emotes/global');
        if (globalRes.ok) {
            const globals = await globalRes.json();
            for (const emote of globals) {
                emoteMap[emote.code] = `https://cdn.betterttv.net/emote/${emote.id}/1x`;
            }
            console.log(`[BTTV] Loaded ${globals.length} global emotes`);
        }

        const channelRes = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`);
        if (!channelRes.ok) { console.warn('[BTTV] Channel not found on BTTV'); return; }

        const data = await channelRes.json();
        const channelEmotes = [...(data.channelEmotes || []), ...(data.sharedEmotes || [])];
        for (const emote of channelEmotes) {
            emoteMap[emote.code] = `https://cdn.betterttv.net/emote/${emote.id}/1x`;
        }
        console.log(`[BTTV] Loaded ${channelEmotes.length} channel emotes`);
    } catch (err) {
        console.error('[BTTV] Failed to fetch emotes:', err);
    }
}

// ─── FrankerFaceZ ─────────────────────────────────────────────────────────────
async function fetchFFZEmotes(twitchUserId) {
    try {
        const globalRes = await fetch('https://api.frankerfacez.com/v1/set/global');
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            let globalCount = 0;
            for (const set of Object.values(globalData.sets || {})) {
                for (const emote of set.emoticons || []) {
                    const url = emote.urls['1'] || Object.values(emote.urls)[0];
                    if (url) {
                        emoteMap[emote.name] = url.startsWith('//') ? `https:${url}` : url;
                        globalCount++;
                    }
                }
            }
            console.log(`[FFZ] Loaded ${globalCount} global emotes`);
        }

        const channelRes = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
        if (!channelRes.ok) { console.warn('[FFZ] Channel not found on FFZ'); return; }

        const data = await channelRes.json();
        let channelCount = 0;
        for (const set of Object.values(data.sets || {})) {
            for (const emote of set.emoticons || []) {
                const url = emote.urls['1'] || Object.values(emote.urls)[0];
                if (url) {
                    emoteMap[emote.name] = url.startsWith('//') ? `https:${url}` : url;
                    channelCount++;
                }
            }
        }
        console.log(`[FFZ] Loaded ${channelCount} channel emotes`);
    } catch (err) {
        console.error('[FFZ] Failed to fetch emotes:', err);
    }
}

// ─── 7TV: Fetch Channel Emotes ────────────────────────────────────────────────
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

// ─── 7TV: Live Emote Updates via EventSub WebSocket ──────────────────────────
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
                if (showToastRemove) showRemovedEmoteToast(name, url);
            }
        }
        for (const item of pushed) {
            const { name, id } = item.value || {};
            if (name && id) {
                const url = `https://cdn.7tv.app/emote/${id}/1x.webp`;
                emoteMap[name] = url;
                console.log(`[7TV] Emote added: ${name}`);
                if (showToastAdd) showNewEmoteToast(name, url);
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

// ─── Safety: HTML Escape ──────────────────────────────────────────────────────
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Replace third-party emote words in a plain-text chunk ───────────────────
function parseThirdPartyEmotes(escapedText) {
    return escapedText.split(' ').map(word => {
        const raw = word
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        if (emoteMap[raw]) {
            return `<img class="chat-emote" src="${emoteMap[raw]}" alt="${word}" title="${word}">`;
        }
        return word;
    }).join(' ');
}

// ─── Parse Full Message (Twitch Native + BTTV + FFZ + 7TV) ───────────────────
function parseMessage(message, twitchEmotes) {
    const ranges = [];
    if (twitchEmotes) {
        for (const [emoteId, positions] of Object.entries(twitchEmotes)) {
            for (const pos of positions) {
                const [start, end] = pos.split('-').map(Number);
                ranges.push({
                    start, end,
                    url: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/1.0`
                });
            }
        }
        ranges.sort((a, b) => a.start - b.start);
    }

    if (ranges.length === 0) return parseThirdPartyEmotes(escapeHTML(message));

    let html = '';
    let cursor = 0;

    for (const range of ranges) {
        if (cursor < range.start) {
            html += parseThirdPartyEmotes(escapeHTML(message.slice(cursor, range.start)));
        }
        const emoteName = message.slice(range.start, range.end + 1);
        html += `<img class="chat-emote" src="${range.url}" alt="${escapeHTML(emoteName)}" title="${escapeHTML(emoteName)}">`;
        cursor = range.end + 1;
    }

    if (cursor < message.length) {
        html += parseThirdPartyEmotes(escapeHTML(message.slice(cursor)));
    }

    return html;
}

// ─── Render a Chat Message ────────────────────────────────────────────────────
function displayMessage(tags, message) {
    const chatContainer = document.getElementById('chat-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    const userColor     = tags.color || '#ffffff';
    const username      = tags['display-name'] || tags.username;
    const parsedMessage = parseMessage(message, tags.emotes);
    const badgesHTML    = renderBadges(tags);

    messageElement.innerHTML = `
        <span class="badges">${badgesHTML}</span><span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
        <span class="message-text">${parsedMessage}</span>
    `;

    if (tags['id'])    messageElement.dataset.msgId   = tags['id'];
    if (tags.username) messageElement.dataset.username = tags.username.toLowerCase();

    chatContainer.appendChild(messageElement);

    if (chatContainer.childNodes.length > 50) {
        chatContainer.removeChild(chatContainer.firstChild);
    }
}

// ─── Remove all messages from a user ─────────────────────────────────────────
function removeUserMessages(username) {
    document.getElementById('chat-container')
        .querySelectorAll(`[data-username="${CSS.escape(username.toLowerCase())}"]`)
        .forEach(el => el.remove());
}

// ─── Connect to Twitch Chat ───────────────────────────────────────────────────
if (channelName) {
    const client = new tmi.Client({
        connection: { secure: true, reconnect: true },
        channels: [channelName],
    });

    client.connect();

    client.on('roomstate', (channel, state) => {
        const twitchUserId = state['room-id'];
        if (twitchUserId) {
            Promise.all([
                fetchFFZEmotes(twitchUserId),
                fetchBTTVEmotes(twitchUserId),
                fetch7TVEmotes(twitchUserId),
                fetchTwitchBadges(twitchUserId),
            ]).then(() => {
                console.log(`[Init] All providers loaded. Emotes: ${Object.keys(emoteMap).length}, Badges: ${Object.keys(badgeMap).length}`);
            });
        }
    });

    client.on('clearchat', () => {
        document.getElementById('chat-container').innerHTML = '';
    });

    client.on('timeout', (channel, username) => removeUserMessages(username));
    client.on('ban',     (channel, username) => removeUserMessages(username));

    client.on('messagedeleted', (channel, username, deletedMessage, tags) => {
        const msgId = tags['target-msg-id'];
        if (msgId) document.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)?.remove();
    });

    client.on('message', (channel, tags, message, self) => {
        displayMessage(tags, message);
    });

} else {
    document.body.innerHTML = "<h2 style='color:red;'>Error: No channel specified in URL</h2>";
}