// ─── chat/parser.js ───────────────────────────────────────────────────────────
// Converts a raw chat message string into rendered HTML.
//
// The core challenge: Twitch native emotes are identified by character position
// (e.g. "chars 5-9 = emote ID 123"), while third-party emotes (BTTV/FFZ/7TV)
// are matched by exact word. Both need to coexist, and zero-width emotes must
// stack visually on top of the preceding emote rather than appearing separately.
//
// Approach:
//   1. Map Twitch emote positions → replace those ranges with emote tokens
//   2. Scan remaining text word-by-word for third-party emotes
//   3. Stack any zero-width emotes onto the previous emote token

// Builds a flat array of tokens from the message.
// Each token: { html: string, isEmote: bool, stacked: bool }
function buildTokens(message, twitchEmotes) {
    // Step 1: collect all Twitch emote character ranges and sort them in order
    const ranges = [];
    if (twitchEmotes) {
        for (const [emoteId, positions] of Object.entries(twitchEmotes)) {
            for (const pos of positions) {
                const [start, end] = pos.split('-').map(Number);
                const name = message.slice(start, end + 1);
                const url  = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0`;
                // Passively cache name→url so reply snippets can render these emotes
                if (name) twitchEmoteByName[name] = url;
                ranges.push({ start, end, name, url });
            }
        }
        ranges.sort((a, b) => a.start - b.start);
    }

    // Step 2: split the message into alternating text/Twitch-emote segments
    // Text gaps between Twitch emotes will be scanned for third-party emotes
    const segments = [];
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
    // Fallback: no emotes at all — treat the whole message as one text segment
    if (segments.length === 0) {
        segments.push({ type: 'text', content: message });
    }

    // Step 3: expand all segments into the final flat token list.
    // Twitch emote segments → single image token.
    // Text segments → word-by-word scan, each word becomes either an emote
    // image token or a plain escaped-text token.
    const tokens = [];

    for (const seg of segments) {
        if (seg.type === 'twitch') {
            tokens.push({
                html:    `<img class="chat-emote" src="${seg.url}" alt="${escapeHTML(seg.name)}" title="${escapeHTML(seg.name)}">`,
                isEmote: true,
                stacked: false
            });
            continue;
        }

        // Split text on spaces; empty strings represent the spaces themselves
        const words = seg.content.split(' ');
        for (const word of words) {
            if (!word) {
                // Preserve a single space between words (avoid double-spaces)
                if (tokens.length && tokens[tokens.length - 1].html !== ' ') {
                    tokens.push({ html: ' ', isEmote: false });
                }
                continue;
            }

            // Match emotes by the raw word — IRC text is never HTML-escaped at this stage
            const raw = word;

            if (emoteMap[raw]) {
                const isZeroWidth = zeroWidthEmotes.has(raw);
                const img = `<img class="chat-emote${isZeroWidth ? ' zero-width' : ''}" src="${emoteMap[raw]}" alt="${escapeHTML(word)}" title="${escapeHTML(word)}">`;

                if (isZeroWidth) {
                    // Zero-width: find the last real emote token and stack onto it
                    // by wrapping both in an .emote-stack span, or extending one if
                    // already stacked.
                    let prevIdx = tokens.length - 1;
                    while (prevIdx >= 0 && tokens[prevIdx].html === ' ') prevIdx--;
                    const prev = prevIdx >= 0 ? tokens[prevIdx] : null;

                    if (prev && prev.isEmote) {
                        // Remove any trailing space tokens between the two emotes
                        while (tokens.length - 1 > prevIdx) tokens.pop();

                        if (prev.stacked) {
                            // Already a stack — insert the new image before the closing </span>
                            prev.html = prev.html.replace('</span>', img + '</span>');
                        } else {
                            // First zero-width on this emote — wrap in a stack container
                            prev.html    = `<span class="emote-stack">${prev.html}${img}</span>`;
                            prev.stacked = true;
                        }
                    } else {
                        // No preceding emote — render as a standalone image
                        tokens.push({ html: img, isEmote: true, stacked: false });
                    }
                } else {
                    tokens.push({ html: img, isEmote: true, stacked: false });
                }
            } else if (!twitchEmotes && twitchEmoteByName[raw]) {
                // Twitch emote matched by name — ONLY used when parsing reply snippet
                // text where no position data is available (twitchEmotes === null).
                // Never used for the main message body where position data exists,
                // because false cache hits can turn plain words into wrong emotes.
                tokens.push({
                    html:    `<img class="chat-emote" src="${twitchEmoteByName[raw]}" alt="${escapeHTML(word)}" title="${escapeHTML(word)}">`,
                    isEmote: true,
                    stacked: false
                });
            } else {
                // Plain text word — escape and push
                tokens.push({ html: escapeHTML(word), isEmote: false });
            }
        }
    }

    return tokens;
}

// Joins tokens into a final HTML string, inserting spaces only where needed.
// Consecutive emotes have no space between them; text tokens already carry
// their spacing from the split above.
function parseMessage(message, twitchEmotes) {
    const tokens = buildTokens(message, twitchEmotes);
    const parts  = [];
    for (let i = 0; i < tokens.length; i++) {
        const t    = tokens[i];
        const prev = tokens[i - 1];
        // Insert a space before this token unless either side is already a space token
        if (prev && t.html !== ' ' && prev.html !== ' ') parts.push(' ');
        parts.push(t.html);
    }
    return parts.join('');
}