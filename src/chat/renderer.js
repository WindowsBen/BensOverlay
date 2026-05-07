// ─── chat/renderer.js ─────────────────────────────────────────────────────────
// Renders incoming chat messages into the DOM.
// Handles normal messages, highlighted messages, /me actions, and reply threads.
// Each message element is tagged with data-msg-id and data-username so
// moderation.js can target and remove them without keeping a separate index.

function displayMessage(tags, message, isAction = false) {
    // Drop messages from users on the exclude list (bots, etc.)
    if (CONFIG.excludedUsers.size && CONFIG.excludedUsers.has((tags.username || '').toLowerCase())) return;

    // Drop messages that start with an excluded prefix (e.g. "!" for bot commands)
    if (CONFIG.excludedPrefixes.length && CONFIG.excludedPrefixes.some(p => message.startsWith(p))) return;

    const chatContainer  = document.getElementById('chat-container'); // always present
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    // Highlighted messages get a special CSS class for accent/bg styling
    if (tags['msg-id'] === 'highlighted-message') {
        if (!CONFIG.showHighlights) return;
        messageElement.classList.add('highlighted-message');
    }

    const userColor  = tags.color || '#ffffff';
    const username   = tags['display-name'] || tags.username;
    const badgesHTML = renderBadges(tags);

    // ── /me action styling ────────────────────────────────────────────────────
    // "colored" — message text takes the user's Twitch name color (or 7TV paint)
    // "italic"  — message text is slanted
    // "none"    — renders identically to a normal message
    let messageStyle = '';
    if (isAction && CONFIG.meStyle !== 'none') {
        if (CONFIG.meStyle === 'colored') {
            messageStyle = `style="color: ${escapeHTML(userColor)}"`;
            // Flag the element so apply7TVCosmetics() also paints the message text
            messageElement.dataset.meColored = '1';
        } else if (CONFIG.meStyle === 'italic') {
            messageStyle = `style="font-style: italic"`;
        }
    }

    // ── Reply context ─────────────────────────────────────────────────────────
    // Twitch sends parent message data in IRC tags when a user hits "Reply".
    // We show a compact quoted bar above the message instead of just the @mention.
    // IRC tag values escape spaces as \s and semicolons as \: — unescape them first.
    const parentMsgId  = tags['reply-parent-msg-id'];
    const parentUser   = tags['reply-parent-display-name'] || tags['reply-parent-user-login'];
    const parentRaw    = tags['reply-parent-msg-body'] || '';  // raw IRC-escaped string
    const parentBody   = parentRaw
        .replace(/\\s/g,  ' ')   // IRC \s → space
        .replace(/\\:/g,  ';')   // IRC \: → semicolon
        .replace(/\\\\/g, '\\')  // IRC \\ → backslash
        .replace(/\\r/g,  '')    // strip carriage return
        .replace(/\\n/g,  '');   // strip newline

    let replyHTML = '';
    if (CONFIG.showReplies && parentMsgId && parentUser) {
        // tmi.js prepends "@Username " to reply messages. Strip it, but also
        // offset the Twitch emote character positions by the same amount —
        // they are relative to the full string, not the stripped one.
        const prefixMatch = message.match(/^@\S+\s*/);
        const prefixLen   = prefixMatch ? prefixMatch[0].length : 0;
        const cleanMessage = prefixLen > 0 ? message.slice(prefixLen) : message;

        // Rebuild emotes map with adjusted positions
        let adjustedEmotes = tags.emotes;
        if (prefixLen > 0 && tags.emotes) {
            adjustedEmotes = {};
            for (const [id, positions] of Object.entries(tags.emotes)) {
                adjustedEmotes[id] = positions
                    .map(pos => {
                        const [s, e] = pos.split('-').map(Number);
                        return `${s - prefixLen}-${e - prefixLen}`;
                    })
                    .filter(pos => {
                        // Drop any positions that ended up negative (shouldn't happen,
                        // but guard against malformed data)
                        const [s] = pos.split('-').map(Number);
                        return s >= 0;
                    });
            }
        }

        // Look up the parent message's emotes from our rolling cache, then seed
        // twitchEmoteByName so the word scanner can resolve them by name.
        const parentEmotes = recentMessageEmotes[parentMsgId] || {};
        for (const [id, positions] of Object.entries(parentEmotes)) {
            const [s, e] = positions[0].split('-').map(Number);
            // Use parentBody (IRC-unescaped) so positions correctly align with characters
            const name = parentBody.slice(s, e + 1);
            if (name) twitchEmoteByName[name] = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`;
        }
        // Note: the current message's own emotes are seeded correctly by buildTokens
        // when it processes cleanMessage+adjustedEmotes below — no manual seeding needed.
        const snippet       = parentBody.length > 60 ? parentBody.slice(0, 60).trimEnd() + '…' : parentBody;
        const parsedSnippet = parseMessage(snippet, null);

        replyHTML = `
            <div class="reply-context" data-reply-to="${escapeHTML(parentMsgId)}">
                <svg class="reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                <span class="reply-parent-name">${escapeHTML(parentUser)}</span>
                <span class="reply-parent-body">${parsedSnippet}</span>
            </div>`;

        messageElement.innerHTML = `
            ${replyHTML}
            <div class="reply-message-row">
                <span class="badges">${badgesHTML}</span><span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
                <span class="message-text" ${messageStyle}>${parseMessage(cleanMessage, adjustedEmotes)}</span>
            </div>`;
    } else {
        messageElement.innerHTML = `
            <span class="badges">${badgesHTML}</span><span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
            <span class="message-text" ${messageStyle}>${parseMessage(message, tags.emotes)}</span>`;
    }

    // Tag the element for moderation targeting — login name (not display-name)
    // because ban/timeout events fire with the login name
    if (tags['id'])    messageElement.dataset.msgId   = tags['id'];
    cacheMessageEmotes(tags['id'], tags.emotes);
    if (tags.username) messageElement.dataset.username = tags.username.toLowerCase();

    chatContainer.appendChild(messageElement);

    // Cap visible messages at 50 to prevent unbounded DOM growth
    if (chatContainer.childNodes.length > 50) {
        chatContainer.removeChild(chatContainer.firstChild);
    }

    // If a message lifetime is set, fade the message out after that delay,
    // then remove it from the DOM once the fade transition finishes.
    if (CONFIG.messageLifetime > 0) {
        setTimeout(() => {
            messageElement.classList.add('fading-out');
            const fadeDuration = parseInt(CONFIG.fadeDuration) || 1000;
            setTimeout(() => messageElement.remove(), fadeDuration);
        }, CONFIG.messageLifetime);
    }

    // Apply 7TV cosmetics (badge + paint) asynchronously — they appear shortly
    // after the message renders rather than blocking it
    if (tags['user-id']) {
        apply7TVCosmetics(tags['user-id'], messageElement);
    }
}