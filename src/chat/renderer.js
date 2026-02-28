// ─── chat/renderer.js ─────────────────────────────────────────────────────────
// Renders a parsed chat message into the DOM.

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

    // Tag for targeted deletion — login name used (not display-name) since
    // moderation events fire with the login name
    if (tags['id'])    messageElement.dataset.msgId   = tags['id'];
    if (tags.username) messageElement.dataset.username = tags.username.toLowerCase();

    chatContainer.appendChild(messageElement);

    // Cap at 50 messages
    if (chatContainer.childNodes.length > 50) {
        chatContainer.removeChild(chatContainer.firstChild);
    }
}