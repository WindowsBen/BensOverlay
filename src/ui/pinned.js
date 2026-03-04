// ─── ui/pinned.js ─────────────────────────────────────────────────────────────
// Handles display and removal of Twitch pinned messages.
// Listens for pinned-chat-update and attempts to detect manual unpins.

let _pinnedTimeout  = null;
let _pinnedMsgId    = null;

const PIN_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 4a1 1 0 0 0-1-1h-1V2h-4v1H9a1 1 0 0 0-1 1v1l2 3v3l-4 3h12l-4-3V9l2-3V4z"/></svg>`;

function showPinnedMessage(tags, message) {
    if (!CONFIG.showPinned) return;

    const container = document.getElementById('pinned-container');
    if (!container) return;

    // Clear any existing pin
    clearPinned(true);

    const pinner    = tags['pinned-by-display-name'] || tags['pinned-by-login'] || 'a moderator';
    const author    = tags['display-name'] || tags.login || 'Unknown';
    const authorColor = tags.color || '#ffffff';
    const msgId     = tags['msg-id-to-pin'] || tags['id'] || '';

    _pinnedMsgId = msgId;

    const parsedBody = parseMessage(message, null);

    const el = document.createElement('div');
    el.className     = 'pinned-message';
    el.dataset.msgId = msgId;
    el.innerHTML = `
        <div class="pinned-header">
            ${PIN_ICON} Pinned by ${escapeHTML(pinner)}
        </div>
        <div class="pinned-body">
            <span class="username" style="color:${escapeHTML(authorColor)}">${escapeHTML(author)}:</span>
            <span class="message-text">${parsedBody}</span>
        </div>
        <div class="pinned-footer">Pinned message</div>
    `;

    container.appendChild(el);

    // Auto-expire if configured
    const duration = CONFIG.pinnedDuration; // seconds, 0 = manual only
    if (duration > 0) {
        _pinnedTimeout = setTimeout(() => clearPinned(false), duration * 1000);
    }
}

function clearPinned(immediate = false) {
    const container = document.getElementById('pinned-container');
    if (!container || !container.firstChild) return;

    if (_pinnedTimeout) {
        clearTimeout(_pinnedTimeout);
        _pinnedTimeout = null;
    }
    _pinnedMsgId = null;

    if (immediate) {
        container.innerHTML = '';
        return;
    }

    // Animate out then remove
    const el = container.firstChild;
    el.classList.add('unpinning');
    el.addEventListener('animationend', () => { container.innerHTML = ''; }, { once: true });
}

// Called from main.js raw_message handler
function handlePinnedChatUpdate(tags, message) {
    console.log('[pinned-chat-update]', tags);
    showPinnedMessage(tags, message);
}

function handlePinnedChatRemove(tags) {
    console.log('[pinned-chat-remove]', tags);
    clearPinned(false);
}