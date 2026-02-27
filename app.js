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
// One hidden master <img> per unique emote URL. The browser animates it on its
// own clock. All chat instances are <canvas> elements that blit from the same
// master on each RAF tick → every copy shows the same frame → perfect sync.
//
// Critical: the master <img> must have real pixel dimensions. Browsers pause
// animation on zero-size or off-layout elements, which is why width:0/height:0
// produces still images. We use visibility:hidden + real size instead.
//
// url → { img, canvases: Set<canvas>, naturalW, naturalH }
const masterRegistry = new Map();

const EMOTE_HEIGHT_PX = 28; // baseline pixel height — CSS scales this to 1.6em

function startRenderLoop() {
    function draw() {
        for (const { img, canvases, naturalW, naturalH } of masterRegistry.values()) {
            // Skip until the image has decoded at least one frame
            if (!img.complete || naturalW === 0) continue;
            for (const canvas of canvases) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
        }
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
}

startRenderLoop();

function registerEmoteCanvas(url, canvas) {
    if (!masterRegistry.has(url)) {
        const entry = { img: null, canvases: new Set(), naturalW: 0, naturalH: 0 };
        masterRegistry.set(url, entry);

        const img = new Image();

        img.onload = () => {
            entry.naturalW = img.naturalWidth;
            entry.naturalH = img.naturalHeight;

            // Now that we know the real aspect ratio, size all canvases that
            // were registered before the image finished loading
            const aspectRatio = entry.naturalW / entry.naturalH;
            for (const c of entry.canvases) {
                c.width  = Math.round(EMOTE_HEIGHT_PX * aspectRatio);
                c.height = EMOTE_HEIGHT_PX;
                // Tell CSS the intrinsic aspect ratio so width:auto works correctly
                c.style.aspectRatio = `${entry.naturalW} / ${entry.naturalH}`;
            }
        };

        // CRITICAL: visibility:hidden keeps the element in the layout engine
        // (so the browser keeps animating it) while keeping it invisible.
        // position:fixed + large negative offset keeps it out of the viewport.
        img.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: ${EMOTE_HEIGHT_PX}px;
            height: ${EMOTE_HEIGHT_PX}px;
            visibility: hidden;
            pointer-events: none;
        `;
        img.src = url;
        document.body.appendChild(img);
        entry.img = img;
    }

    const entry = masterRegistry.get(url);
    entry.canvases.add(canvas);

    // If the image already loaded before this canvas was registered, size it now
    if (entry.naturalW > 0) {
        const aspectRatio = entry.naturalW / entry.naturalH;
        canvas.width  = Math.round(EMOTE_HEIGHT_PX * aspectRatio);
        canvas.height = EMOTE_HEIGHT_PX;
        canvas.style.aspectRatio = `${entry.naturalW} / ${entry.naturalH}`;
    } else {
        // Default square until onload fires — prevents zero-size flash
        canvas.width  = EMOTE_HEIGHT_PX;
        canvas.height = EMOTE_HEIGHT_PX;
    }
}

function unregisterEmoteCanvas(url, canvas) {
    const entry = masterRegistry.get(url);
    if (entry) entry.canvases.delete(canvas);
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
            let count = 0;
            for (const set of Object.values(globalData.sets || {})) {
                for (const emote of set.emoticons || []) {
                    const url = emote.urls['1'] || Object.values(emote.urls)[0];
                    if (url) { emoteMap[emote.name] = url.startsWith('//') ? `https:${url}` : url; count++; }
                }
            }
            console.log(`[FFZ] Loaded ${count} global emotes`);
        }

        const channelRes = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
        if (!channelRes.ok) { console.warn('[FFZ] Channel not found on FFZ'); return; }

        const data = await channelRes.json();
        let count = 0;
        for (const set of Object.values(data.sets || {})) {
            for (const emote of set.emoticons || []) {
                const url = emote.urls['1'] || Object.values(emote.urls)[0];
                if (url) { emoteMap[emote.name] = url.startsWith('//') ? `https:${url}` : url; count++; }
            }
        }
        console.log(`[FFZ] Loaded ${count} channel emotes`);
    } catch (err) {
        console.error('[FFZ] Failed to fetch emotes:', err);
    }
}

// ─── 7TV ──────────────────────────────────────────────────────────────────────
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
            if (name) { delete emoteMap[name]; console.log(`[7TV] Removed: ${name}`); }
        }
        for (const item of pushed) {
            const { name, id } = item.value || {};
            if (name && id) { emoteMap[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`; console.log(`[7TV] Added: ${name}`); }
        }
        for (const item of updated) {
            if (item.old_value?.name) delete emoteMap[item.old_value.name];
            const { name, id } = item.value || {};
            if (name && id) { emoteMap[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`; console.log(`[7TV] Updated: ${name}`); }
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

// ─── Emit placeholder spans (canvas registered after DOM insertion) ────────────
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

// ─── Swap placeholders → registered canvases after DOM insertion ──────────────
function attachEmoteCanvases(messageElement) {
    for (const placeholder of messageElement.querySelectorAll('.emote-placeholder')) {
        const url  = placeholder.dataset.emoteUrl;
        const name = placeholder.dataset.emoteName;

        const canvas = document.createElement('canvas');
        canvas.className = 'chat-emote';
        canvas.title = name;
        canvas.setAttribute('aria-label', name);

        placeholder.replaceWith(canvas);
        registerEmoteCanvas(url, canvas); // sizes canvas + starts blitting
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
        // Twitch native emotes are static PNGs — plain <img> is fine
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
    const username  = tags['display-name'] || tags.username;

    messageElement.innerHTML = `
        <span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
        <span class="message-text">${parseMessage(message, tags.emotes)}</span>
    `;

    chatContainer.appendChild(messageElement);
    attachEmoteCanvases(messageElement);

    // Cap at 50 — unregister canvases from evicted messages
    if (chatContainer.childNodes.length > 50) {
        const removed = chatContainer.firstChild;
        for (const canvas of removed.querySelectorAll('canvas.chat-emote')) {
            for (const [url, entry] of masterRegistry.entries()) {
                if (entry.canvases.has(canvas)) { unregisterEmoteCanvas(url, canvas); break; }
            }
        }
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