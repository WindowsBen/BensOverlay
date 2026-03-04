// ─── chat/renderer.js ─────────────────────────────────────────────────────────
// Renders a parsed chat message into the DOM.

function displayMessage(tags, message, isAction = false) {
    // Drop messages from excluded users
    if (CONFIG.excludedUsers.size && CONFIG.excludedUsers.has((tags.username || '').toLowerCase())) return;

    // Drop messages starting with an excluded prefix
    if (CONFIG.excludedPrefixes.length && CONFIG.excludedPrefixes.some(p => message.startsWith(p))) return;

    const chatContainer  = document.getElementById('chat-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    if (tags['msg-id'] === 'highlighted-message') {
        if (!CONFIG.showHighlights) return;
        messageElement.classList.add('highlighted-message');
    }

    const userColor  = tags.color || '#ffffff';
    const username   = tags['display-name'] || tags.username;
    const badgesHTML = renderBadges(tags);

    // ── /me action styling ────────────────────────────────────────────────────
    let messageStyle = '';
    if (isAction && CONFIG.meStyle !== 'none') {
        if (CONFIG.meStyle === 'colored') {
            messageStyle = `style="color: ${escapeHTML(userColor)}"`;
        } else if (CONFIG.meStyle === 'italic') {
            messageStyle = `style="font-style: italic"`;
        }
    }

    // ── Reply handling ────────────────────────────────────────────────────────
    const parentMsgId = tags['reply-parent-msg-id'];
    const parentUser  = tags['reply-parent-display-name'] || tags['reply-parent-user-login'];
    const parentBody  = (tags['reply-parent-msg-body'] || '')
        .replace(/\\s/g, ' ')
        .replace(/\\:/g, ';')
        .replace(/\\\\/g, '\\')
        .replace(/\\r/g, '')
        .replace(/\\n/g, '');

    let replyHTML = '';
    if (CONFIG.showReplies && parentMsgId && parentUser) {
        // Strip the leading @mention Twitch prepends to reply messages
        const cleanMessage = message.replace(/^@\S+\s*/, '');

        // Truncate parent body to keep the quote short, then parse third-party emotes
        // (Twitch emote positions aren't available for parent messages)
        const snippet     = parentBody.length > 60 ? parentBody.slice(0, 60).trimEnd() + '…' : parentBody;
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
                <span class="message-text" ${messageStyle}>${parseMessage(cleanMessage, tags.emotes)}</span>
            </div>`;
    } else {
        messageElement.innerHTML = `
            <span class="badges">${badgesHTML}</span><span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
            <span class="message-text" ${messageStyle}>${parseMessage(message, tags.emotes)}</span>`;
    }

    // Tag for targeted deletion — login name used (not display-name) since
    // moderation events fire with the login name
    if (tags['id'])    messageElement.dataset.msgId   = tags['id'];
    if (tags.username) messageElement.dataset.username = tags.username.toLowerCase();

    chatContainer.appendChild(messageElement);

    // Cap at 50 messages
    if (chatContainer.childNodes.length > 50) {
        chatContainer.removeChild(chatContainer.firstChild);
    }

    // Apply 7TV cosmetics async — badge/paint appear shortly after render
    if (tags['user-id']) {
        apply7TVCosmetics(tags['user-id'], messageElement);
    }
}