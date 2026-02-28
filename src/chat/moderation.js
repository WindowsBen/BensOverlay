// ─── chat/moderation.js ───────────────────────────────────────────────────────
// Handles all moderation events: clear, ban, timeout, single message delete.

function removeUserMessages(username) {
    document.getElementById('chat-container')
        .querySelectorAll(`[data-username="${CSS.escape(username.toLowerCase())}"]`)
        .forEach(el => el.remove());
}

function registerModerationListeners(client) {
    // /clear — wipe everything
    client.on('clearchat', () => {
        document.getElementById('chat-container').innerHTML = '';
    });

    // Timeout or ban — remove all messages from that user
    client.on('timeout', (channel, username) => removeUserMessages(username));
    client.on('ban',     (channel, username) => removeUserMessages(username));

    // Single message deleted by a mod or broadcaster
    client.on('messagedeleted', (channel, username, deletedMessage, tags) => {
        const msgId = tags['target-msg-id'];
        if (msgId) document.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)?.remove();
    });
}