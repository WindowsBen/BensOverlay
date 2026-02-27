// ─── Read URL Settings ────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const channelName = params.get('channel');
const fontSize = params.get('fontSize');
const shadowColor = params.get('shadow');

if (fontSize) document.documentElement.style.setProperty('--chat-font-size', fontSize);
if (shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', shadowColor);

// Toast visibility — default true if param is missing (backwards compatible)
const showToastAdd    = params.get('toastAdd')    !== '0';
const showToastRemove = params.get('toastRemove') !== '0';

// ─── Emote Registry ───────────────────────────────────────────────────────────
const emoteMap = {};

// ─── New Emote Toast Notification ────────────────────────────────────────────
function showNewEmoteToast(emoteName, emoteUrl) {
    const toast = document.createElement('div');
    toast.className = 'emote-toast';
    toast.innerHTML = `
        New Emote added to Set: <strong>${escapeHTML(emoteName)}</strong>
        <img class="toast-emote" src="${escapeHTML(emoteUrl)}" alt="${escapeHTML(emoteName)}">
    `;

    document.body.appendChild(toast);

    // Trigger the enter animation on next frame (so CSS transition fires)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('emote-toast--visible'));
    });

    // Start fade-out after 4s, remove from DOM after transition completes
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

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('emote-toast--visible'));
    });

    setTimeout(() => {
        toast.classList.remove('emote-toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
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
                const url = emoteMap[name]; // grab URL before deleting
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
            if (name && id) { emoteMap[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`; console.log(`[7TV] Emote updated: ${name}`); }
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

    const userColor = tags.color || '#ffffff';
    const username = tags['display-name'] || tags.username;
    const parsedMessage = parseMessage(message, tags.emotes);

    messageElement.innerHTML = `
        <span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
        <span class="message-text">${parsedMessage}</span>
    `;

    // Tag for targeted deletion — use login name (tags.username) not display-name,
    // since clearchat fires with the login name and they can differ for some users
    if (tags['id'])        messageElement.dataset.msgId    = tags['id'];
    if (tags.username)     messageElement.dataset.username  = tags.username.toLowerCase();

    chatContainer.appendChild(messageElement);

    if (chatContainer.childNodes.length > 50) {
        chatContainer.removeChild(chatContainer.firstChild);
    }
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
            ]).then(() => {
                console.log(`[Emotes] All providers loaded. Total: ${Object.keys(emoteMap).length} emotes`);
            });
        }
    });

    // /clear — wipe everything; with username = timeout or ban
    client.on('clearchat', (channel, username) => {
        if (username) {
            // Timeout or ban — remove all messages from that user
            const chatContainer = document.getElementById('chat-container');
            chatContainer.querySelectorAll(`[data-username="${CSS.escape(username.toLowerCase())}"]`)
                .forEach(el => el.remove());
        } else {
            // Full chat clear
            document.getElementById('chat-container').innerHTML = '';
        }
    });

    // Single message deleted by a mod or the broadcaster
    client.on('messagedeleted', (channel, username, deletedMessage, tags) => {
        const msgId = tags['target-msg-id'];
        if (msgId) {
            document.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)?.remove();
        }
    });

    client.on('message', (channel, tags, message, self) => {
        displayMessage(tags, message);
    });

} else {
    document.body.innerHTML = "<h2 style='color:red;'>Error: No channel specified in URL</h2>";
}