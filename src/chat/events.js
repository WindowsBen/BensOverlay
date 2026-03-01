// ─── chat/events.js ───────────────────────────────────────────────────────────
// Renders sub and bit (cheer) event messages into the chat window.
// All functions are no-ops if CONFIG.showEventMessages is false.

const SUB_PLAN_NAMES = {
    'Prime': 'Prime',
    '1000': 'Tier 1',
    '2000': 'Tier 2',
    '3000': 'Tier 3',
};

function subPlanLabel(plan) {
    return SUB_PLAN_NAMES[plan] || plan || 'Tier 1';
}

function displayEventMessage(iconSvg, label, detail, extraMessage = '', messageIsHTML = false) {
    if (!CONFIG.showEventMessages) return;

    const container = document.getElementById('chat-container');
    const el = document.createElement('div');
    el.className = 'chat-message event-message';

    let messageHTML = '';
    if (extraMessage) {
        const content = messageIsHTML ? extraMessage : parseMessage(extraMessage, null);
        messageHTML = `<span class="event-user-message">${content}</span>`;
    }

    el.innerHTML = `
        <span class="event-icon">${iconSvg}</span>
        <span class="event-body">
            <span class="event-label">${escapeHTML(label)}</span>
            <span class="event-detail">${escapeHTML(detail)}</span>
            ${messageHTML}
        </span>`;

    container.appendChild(el);

    if (container.childNodes.length > 50) {
        container.removeChild(container.firstChild);
    }
}

// ── Sub icons ────────────────────────────────────────────────────────────────

const ICON_SUB = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l2.4 4.8 5.3.8-3.85 3.75.91 5.3L10 14.1l-4.76 2.51.91-5.3L2.3 7.6l5.3-.8z"/></svg>`;
const ICON_GIFT = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 8h14v10H3V8zm6 0V6a2 2 0 10-2 2h2zm2 0h2a2 2 0 10-2-2v2zM2 6h16v3H2V6z"/></svg>`;
const ICON_BITS = `<svg viewBox="0 0 20 20" fill="currentColor"><polygon points="10,2 13,8 19,9 14.5,13.5 16,19 10,16 4,19 5.5,13.5 1,9 7,8"/></svg>`;

// ── Event handlers ────────────────────────────────────────────────────────────

function handleSubscription(channel, username, methods, message, userstate) {
    const name = userstate['display-name'] || username;
    const plan = subPlanLabel(methods?.plan || userstate['msg-param-sub-plan']);
    displayEventMessage(ICON_SUB, name, `subscribed with ${plan}!`);
}

function handleResub(channel, username, months, message, userstate) {
    const name = userstate['display-name'] || username;
    const plan = subPlanLabel(userstate['msg-param-sub-plan']);
    const cumMonths = userstate['msg-param-cumulative-months'] || months;
    displayEventMessage(
        ICON_SUB,
        name,
        `resubscribed (${cumMonths} months, ${plan})`,
        message || ''
    );
}

function handleSubgift(channel, username, streakMonths, recipient, methods, userstate) {
    const gifter = userstate['display-name'] || username;
    const plan = subPlanLabel(methods?.plan || userstate['msg-param-sub-plan']);
    displayEventMessage(ICON_GIFT, gifter, `gifted a ${plan} sub to ${recipient}!`);
}

function handleSubmysterygift(channel, username, numbOfSubs, methods, userstate) {
    const gifter = userstate['display-name'] || username;
    const plan = subPlanLabel(methods?.plan);
    displayEventMessage(ICON_GIFT, gifter, `gifted ${numbOfSubs} ${plan} subs to the channel!`);
}

function handleCheer(channel, userstate, message) {
    const name = userstate['display-name'] || userstate.username;
    const bits = userstate.bits;
    const cheerHTML = renderCheerMessage(message);
    displayEventMessage(
        ICON_BITS,
        name,
        `cheered ${bits} bit${bits === '1' ? '' : 's'}!`,
        cheerHTML,
        true // already HTML, don't re-escape
    );
}