// ─── chat/parser.js ───────────────────────────────────────────────────────────
// Parses chat messages — handles Twitch native emotes (by character range)
// and third-party emotes (BTTV/FFZ/7TV, by word lookup in emoteMap).
// Zero-width emotes stack on top of the previous emote using .emote-stack.

function parseThirdPartyEmotes(escapedText) {
    const words = escapedText.split(' ');
    const tokens = []; // array of { html, isEmote, stacked }

    for (const word of words) {
        const raw = word
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"');

        if (emoteMap[raw]) {
            const isZeroWidth = zeroWidthEmotes.has(raw);
            const img = `<img class="chat-emote${isZeroWidth ? ' zero-width' : ''}" src="${emoteMap[raw]}" alt="${word}" title="${word}">`;

            if (isZeroWidth && tokens.length > 0 && tokens[tokens.length - 1].isEmote) {
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
            tokens.push({ html: word, isEmote: false });
        }
    }

    return tokens.map(t => t.html).join(' ');
}

function parseMessage(message, twitchEmotes) {
    const ranges = [];
    if (twitchEmotes) {
        for (const [emoteId, positions] of Object.entries(twitchEmotes)) {
            for (const pos of positions) {
                const [start, end] = pos.split('-').map(Number);
                ranges.push({
                    start, end,
                    url: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0`
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