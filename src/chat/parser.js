// ─── chat/parser.js ───────────────────────────────────────────────────────────
// Parses chat messages into a unified token list, then renders with zero-width
// stacking. Twitch native emotes and third-party emotes are handled in one pass
// so zero-width emotes can stack onto Twitch emotes correctly.

function buildTokens(message, twitchEmotes) {
    // Step 1: collect Twitch native emote ranges
    const ranges = [];
    if (twitchEmotes) {
        for (const [emoteId, positions] of Object.entries(twitchEmotes)) {
            for (const pos of positions) {
                const [start, end] = pos.split('-').map(Number);
                ranges.push({
                    start, end,
                    name: message.slice(start, end + 1),
                    url: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0`
                });
            }
        }
        ranges.sort((a, b) => a.start - b.start);
    }

    // Step 2: split message into segments (text gaps + Twitch emotes)
    // Each segment is either a Twitch emote token or a text chunk to word-scan
    const segments = []; // { type: 'twitch'|'text', ... }
    let cursor = 0;
    for (const range of ranges) {
        if (cursor < range.start) {
            segments.push({ type: 'text', content: message.slice(cursor, range.start) });
        }
        segments.push({ type: 'twitch', name: range.name, url: range.url });
        cursor = range.end + 1;
    }
    if (cursor < message.length) {
        segments.push({ type: 'text', content: message.slice(cursor) });
    }
    if (segments.length === 0) {
        segments.push({ type: 'text', content: message });
    }

    // Step 3: expand text segments into word tokens, producing a flat token list
    // { html, isEmote, stacked }
    const tokens = [];

    for (const seg of segments) {
        if (seg.type === 'twitch') {
            tokens.push({
                html: `<img class="chat-emote" src="${seg.url}" alt="${escapeHTML(seg.name)}" title="${escapeHTML(seg.name)}">`,
                isEmote: true,
                stacked: false
            });
            continue;
        }

        // Text segment — scan word by word for third-party emotes
        const words = seg.content.split(' ');
        for (const word of words) {
            if (!word) {
                // Preserve spacing between segments
                if (tokens.length && tokens[tokens.length - 1].html !== ' ') {
                    tokens.push({ html: ' ', isEmote: false });
                }
                continue;
            }

            const raw = word
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>').replace(/&quot;/g, '"');

            if (emoteMap[raw]) {
                const isZeroWidth = zeroWidthEmotes.has(raw);
                const img = `<img class="chat-emote${isZeroWidth ? ' zero-width' : ''}" src="${emoteMap[raw]}" alt="${escapeHTML(word)}" title="${escapeHTML(word)}">`;

                if (isZeroWidth) {
                    // Find the last non-space token to stack onto
                    let prevIdx = tokens.length - 1;
                    while (prevIdx >= 0 && tokens[prevIdx].html === ' ') prevIdx--;
                    const prev = prevIdx >= 0 ? tokens[prevIdx] : null;

                    if (prev && prev.isEmote) {
                        // Remove any trailing space tokens before the stack
                        while (tokens.length - 1 > prevIdx) tokens.pop();

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
                    tokens.push({ html: img, isEmote: true, stacked: false });
                }
            } else {
                tokens.push({ html: escapeHTML(word), isEmote: false });
            }
        }
    }

    return tokens;
}

function parseMessage(message, twitchEmotes) {
    const tokens = buildTokens(message, twitchEmotes);
    // Join tokens — text tokens already have spaces baked in from the split,
    // but emote tokens need spaces around them unless adjacent to another emote
    const parts = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        // Add space before token if prev exists and neither is a lone space token
        if (prev && t.html !== ' ' && prev.html !== ' ') parts.push(' ');
        parts.push(t.html);
    }
    return parts.join('');
}