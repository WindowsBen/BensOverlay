// ─── chat/parser.js ───────────────────────────────────────────────────────────
// Parses chat messages. Handles:
//   - Twitch native emotes (by character range)
//   - Third-party emotes (BTTV/FFZ/7TV by word lookup)
//   - Zero-width overlays (7TV zero-width, FFZ modifier emotes) — come AFTER target
//   - BTTV modifier keywords (w!, h!, v!, z!) — come BEFORE target emote

function parseThirdPartyEmotes(escapedText) {
    const words = escapedText.split(' ');
    const tokens = []; // { html, isEmote, stacked }
    let pendingBttvModifier = null; // BTTV modifier keyword waiting for the next emote

    for (const word of words) {
        const raw = word
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"');

        // ── BTTV modifier keyword (e.g. "w!") ───────────────────────────────
        if (BTTV_MODIFIERS[raw]) {
            pendingBttvModifier = BTTV_MODIFIERS[raw];
            // Don't render the keyword itself — consume it silently
            continue;
        }

        if (emoteMap[raw]) {
            const isOverlay = zeroWidthEmotes.has(raw) || ffzModifierEmotes.has(raw);

            // Build CSS class list
            let classes = 'chat-emote';
            if (pendingBttvModifier) {
                classes += ` ${pendingBttvModifier}`;
                pendingBttvModifier = null;
            }
            if (isOverlay) classes += ' zero-width';

            const img = `<img class="${classes}" src="${emoteMap[raw]}" alt="${word}" title="${word}">`;

            if (isOverlay && tokens.length > 0 && tokens[tokens.length - 1].isEmote) {
                // Stack this overlay on top of the preceding emote
                const prev = tokens[tokens.length - 1];
                if (prev.stacked) {
                    prev.html = prev.html.replace('</span>', img + '</span>');
                } else {
                    prev.html = `<span class="emote-stack">${prev.html}${img}</span>`;
                    prev.stacked = true;
                }
            } else {
                tokens.push({ html: img, isEmote: true, stacked: false });
            }
        } else {
            // Not an emote — if there's a pending modifier it wasn't consumed, render the keyword as text
            if (pendingBttvModifier) {
                tokens.push({ html: Object.keys(BTTV_MODIFIERS).find(k => BTTV_MODIFIERS[k] === pendingBttvModifier), isEmote: false });
                pendingBttvModifier = null;
            }
            tokens.push({ html: word, isEmote: false });
        }
    }

    // Trailing unused modifier (e.g. "w!" at end of message)
    if (pendingBttvModifier) {
        tokens.push({ html: Object.keys(BTTV_MODIFIERS).find(k => BTTV_MODIFIERS[k] === pendingBttvModifier), isEmote: false });
    }

    return tokens.map(t => t.html).join(' ');
}

function parseMessage(message, twitchEmotes) {
    // Build sorted list of Twitch native emote character ranges
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