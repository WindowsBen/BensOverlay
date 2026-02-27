// ─── Read URL Settings ────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const channelName = params.get('channel');
const fontSize = params.get('fontSize');
const shadowColor = params.get('shadow');

if (fontSize) document.documentElement.style.setProperty('--chat-font-size', fontSize);
if (shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', shadowColor);

// ─── Emote Registry ───────────────────────────────────────────────────────────
const emoteMap = {};

// ─── Synced Animated Emote Renderer ──────────────────────────────────────────
// One hidden master <img> per emote URL — the browser animates it independently.
// All chat instances are <canvas> elements that copy from the same master each
// RAF tick, so every copy always shows the same frame → perfect sync.

const EMOTE_SIZE = 28; // px — matches roughly 1.6em at 16px base font

// url → { img: HTMLImageElement, canvases: Set<HTMLCanvasElement> }
const masterRegistry = new Map();

// Start the single shared draw loop
function startRenderLoop() {
    function draw() {
        for (const { img, canvases } of masterRegistry.values()) {
            if (!img.complete) continue; // Skip if master hasn't loaded yet
            for (const canvas of canvases) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, EMOTE_SIZE, EMOTE_SIZE);
                ctx.drawImage(img, 0, 0, EMOTE_SIZE, EMOTE_SIZE);
            }
        }
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
}

startRenderLoop();

// Register a canvas for a given emote URL.
// Creates the master <img> on first use.
function registerEmoteCanvas(url, canvas) {
    if (!masterRegistry.has(url)) {
        const img = new Image();
        img.src = url;
        img.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;'; // hidden
        document.body.appendChild(img);
        masterRegistry.set(url, { img, canvases: new Set() });
    }
    masterRegistry.get(url).canvases.add(canvas);
}

// Unregister a canvas (called when a message is removed from chat)
function unregisterEmoteCanvas(url, canvas) {
    const entry = masterRegistry.get(url);
    if (!entry) return;
    entry.canvases.delete(canvas);
    // Keep the master img alive even if no canvases — it'll be reused
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
            if (name) { delete emoteMap[name]; console.log(`[7TV] Emote removed: ${name}`); }
        }
        for (const item of pushed) {
            const { name, id } = item.value || {};
            if (name && id) { emoteMap[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`; console.log(`[7TV] Emote added: ${name}`); }
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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Build emote placeholder tokens for innerHTML ─────────────────────────────
// We can't register canvases during innerHTML building (elements don't exist yet),
// so we emit <span data-emote-url="..." data-emote-name="..."> placeholders and
// swap them out in a post-processing step after the element is in the DOM.
function parseThirdPartyEmotes(escapedText) {
    return escapedText.split(' ').map(word => {
        const raw = word
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        if (emoteMap[raw]) {
            return `<span class="emote-placeholder" data-emote-url="${escapeHTML(emoteMap[raw])}" data-emote-name="${word}"></span>`;
        }
        return word;
    }).join(' ');
}

// ─── Swap placeholders → registered canvases ─────────────────────────────────
function attachEmoteCanvases(messageElement) {
    const placeholders = messageElement.querySelectorAll('.emote-placeholder');
    for (const placeholder of placeholders) {
        const url = placeholder.dataset.emoteUrl;
        const name = placeholder.dataset.emoteName;

        const canvas = document.createElement('canvas');
        canvas.width = EMOTE_SIZE;
        canvas.height = EMOTE_SIZE;
        canvas.className = 'chat-emote';
        canvas.title = name;
        canvas.setAttribute('aria-label', name);

        placeholder.replaceWith(canvas);
        registerEmoteCanvas(url, canvas);
    }
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

    if (ranges.length === 0) {
        return parseThirdPartyEmotes(escapeHTML(message));
    }

    let html = '';
    let cursor = 0;

    for (const range of ranges) {
        if (cursor < range.start) {
            html += parseThirdPartyEmotes(escapeHTML(message.slice(cursor, range.start)));
        }
        const emoteName = message.slice(range.start, range.end + 1);
        // Twitch native emotes aren't animated, so plain <img> is fine here
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

    chatContainer.appendChild(messageElement);

    // Swap emote placeholders → canvases now that the element is in the DOM
    attachEmoteCanvases(messageElement);

    // Cap at 50 messages — unregister canvases from removed messages
    if (chatContainer.childNodes.length > 50) {
        const removed = chatContainer.firstChild;
        removed.querySelectorAll('canvas.chat-emote').forEach(canvas => {
            // Find which URL this canvas belongs to and unregister it
            for (const [url, entry] of masterRegistry.entries()) {
                if (entry.canvases.has(canvas)) {
                    unregisterEmoteCanvas(url, canvas);
                    break;
                }
            }
        });
        chatContainer.removeChild(removed);
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

    client.on('message', (channel, tags, message, self) => {
        displayMessage(tags, message);
    });

} else {
    document.body.innerHTML = "<h2 style='color:red;'>Error: No channel specified in URL</h2>";
}