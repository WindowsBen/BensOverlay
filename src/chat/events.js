// ─── chat/events.js ───────────────────────────────────────────────────────────
// Handles Twitch subscription, gift, cheer, and watch streak events.
// Each handler checks its CONFIG toggle before doing anything, so disabling
// an event type in the configurator produces zero DOM output.

// Maps Twitch's internal sub plan codes to human-readable tier names
const SUB_PLAN_NAMES = {
    'Prime': 'Prime',
    '1000':  'Tier 1',
    '2000':  'Tier 2',
    '3000':  'Tier 3',
};

function subPlanLabel(plan) {
    return SUB_PLAN_NAMES[plan] || plan || 'Tier 1';
}

// Renders a styled event message (sub, gift, bits, streak) into the chat container.
// iconSvg     — inline SVG string for the event icon
// label       — the username / bold part
// detail      — the action description (e.g. "subscribed with Tier 1!")
// extraMessage — optional user-typed message to show below the detail
// messageIsHTML — true if extraMessage is already parsed HTML (e.g. cheermotes)
// typeClass   — CSS class suffix for per-event-type accent/bg colors
function displayEventMessage(iconSvg, label, detail, extraMessage = '', messageIsHTML = false, typeClass = '') {
    const container = document.getElementById('chat-container');
    const el = document.createElement('div');
    el.className = `chat-message event-message${typeClass ? ' ' + typeClass : ''}`;

    let messageHTML = '';
    if (extraMessage) {
        // Parse third-party emotes in user messages; cheer HTML is passed pre-rendered
        const content = messageIsHTML ? extraMessage : parseMessage(extraMessage, null);
        messageHTML = `<span class="event-user-message">${content}</span>`;
    }

    el.innerHTML = `
        <span class="event-icon${typeClass ? ' ' + typeClass.split(' ')[0] + '-icon' : ''}">${iconSvg}</span>
        <span class="event-body">
            <span class="event-label">${escapeHTML(label)}</span>
            <span class="event-detail">${escapeHTML(detail)}</span>
            ${messageHTML}
        </span>`;

    container.appendChild(el);
    // Keep the chat capped at 50 messages
    if (container.childNodes.length > 50) container.removeChild(container.firstChild);

    if (CONFIG.messageLifetime > 0) {
        setTimeout(() => {
            el.classList.add('fading-out');
            const fadeDuration = parseInt(CONFIG.fadeDuration) || 1000;
            setTimeout(() => el.remove(), fadeDuration);
        }, CONFIG.messageLifetime);
    }
}

// SVG icons for each event type
const ICON_SUB    = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l2.4 4.8 5.3.8-3.85 3.75.91 5.3L10 14.1l-4.76 2.51.91-5.3L2.3 7.6l5.3-.8z"/></svg>`;
const ICON_GIFT   = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 8h14v10H3V8zm6 0V6a2 2 0 10-2 2h2zm2 0h2a2 2 0 10-2-2v2zM2 6h16v3H2V6z"/></svg>`;
const ICON_BITS   = `<svg viewBox="0 0 20 20" fill="currentColor"><polygon points="10,2 13,8 19,9 14.5,13.5 16,19 10,16 4,19 5.5,13.5 1,9 7,8"/></svg>`;
const ICON_STREAK = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M11.5 2C9 5 8 7.5 9.5 10c-1-.5-2-1.5-2-3C5.5 9 5 12 7 14a5 5 0 0010 0c0-3.5-2-6-5.5-12z"/></svg>`;

// ── Subscription handlers ──────────────────────────────────────────────────────

// New sub (first-time) — no message body
function handleSubscription(channel, username, methods, message, userstate) {
    if (!CONFIG.showResubs) return;
    const name   = userstate['display-name'] || username;
    const plan   = subPlanLabel(methods?.plan || userstate['msg-param-sub-plan']);
    const detail = `${CONFIG.resubLabel || 'subscribed'} with ${plan}!`;
    displayEventMessage(ICON_SUB, name, detail, '', false, 'sub-message');
}

// Resub — may include a user-typed message with emotes
function handleResub(channel, username, months, message, userstate) {
    if (!CONFIG.showResubs) return;
    const name      = userstate['display-name'] || username;
    const plan      = subPlanLabel(userstate['msg-param-sub-plan']);
    const cumMonths = userstate['msg-param-cumulative-months'] || months;
    const detail    = `${CONFIG.resubLabel || 'resubscribed'} (${cumMonths} months, ${plan})`;
    // Pass emote positions from userstate so Twitch native emotes render in the message
    const parsedMsg = message ? parseMessage(message, userstate.emotes) : '';
    displayEventMessage(ICON_SUB, name, detail, parsedMsg, true, 'sub-message');
}

// Single gifted sub to a specific recipient
function handleSubgift(channel, username, streakMonths, recipient, methods, userstate) {
    if (!CONFIG.showGifts) return;
    const gifter = userstate['display-name'] || username;
    const plan   = subPlanLabel(methods?.plan || userstate['msg-param-sub-plan']);
    const detail = `${CONFIG.giftLabel || 'gifted'} a ${plan} sub to ${recipient}!`;
    displayEventMessage(ICON_GIFT, gifter, detail, '', false, 'gift-message');
}

// Mystery gift — one person gifts N subs to random viewers
function handleSubmysterygift(channel, username, numbOfSubs, methods, userstate) {
    if (!CONFIG.showGifts) return;
    const gifter = userstate['display-name'] || username;
    const plan   = subPlanLabel(methods?.plan);
    const detail = `${CONFIG.giftLabel || 'gifted'} ${numbOfSubs} ${plan} subs to the channel!`;
    displayEventMessage(ICON_GIFT, gifter, detail, '', false, 'gift-message');
}

// ── Bits / Cheers ──────────────────────────────────────────────────────────────

function handleCheer(channel, userstate, message) {
    if (!CONFIG.showBits) return;
    const name     = userstate['display-name'] || userstate.username;
    const bits     = userstate.bits;
    const detail   = `${CONFIG.bitsLabel || 'cheered'} ${bits} bit${bits === '1' ? '' : 's'}!`;
    // renderCheerMessage replaces cheer tokens (e.g. "Cheer100") with animated images
    const cheerHTML = renderCheerMessage(message);
    displayEventMessage(ICON_BITS, name, detail, cheerHTML, true, 'bits-message');
}

// ── Announcements ─────────────────────────────────────────────────────────────
// /announce, /announceblue, /announcegreen, /announceorange, /announcepurple
// Arrive as USERNOTICE with msg-id="announcement" and msg-param-color set to
// "PRIMARY", "BLUE", "GREEN", "ORANGE", or "PURPLE".

const ANNOUNCE_COLOR_CLASS = {
    'PRIMARY': 'announce-primary',
    'BLUE':    'announce-blue',
    'GREEN':   'announce-green',
    'ORANGE':  'announce-orange',
    'PURPLE':  'announce-purple',
};

const ANNOUNCE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;

function handleAnnouncement(tags, message) {
    if (!CONFIG.showAnnouncements) return;

    const colorKey   = (tags['msg-param-color'] || 'PRIMARY').toUpperCase();
    const colorClass = ANNOUNCE_COLOR_CLASS[colorKey] || 'announce-primary';
    const username   = tags['display-name'] || tags.login || 'Moderator';
    const userColor  = tags.color || '#efeff1';

    // Raw IRC badges tag is "set/version,set/version" — parse into the object
    // format that renderBadges expects (same shape tmi.js produces for PRIVMSG)
    const rawBadges = tags.badges;
    if (typeof rawBadges === 'string') {
        tags.badges = {};
        for (const pair of rawBadges.split(',')) {
            const [set, version] = pair.split('/');
            if (set) tags.badges[set] = version || '1';
        }
    }

    // renderBadges uses tags.username for FFZ/Chatterino lookups —
    // USERNOTICE provides the login name under a different key
    if (!tags.username && tags.login) tags.username = tags.login;

    const badgesHTML = renderBadges(tags);
    const parsedMsg  = parseMessage(message, parseRawEmotesTag(tags.emotes));

    const container = document.getElementById('chat-container');
    const el        = document.createElement('div');
    el.className    = `chat-message announcement-message ${colorClass}`;

    el.innerHTML = `
        <div class="announcement-header">
            ${ANNOUNCE_ICON} Announcement
        </div>
        <span class="badges">${badgesHTML}</span><span class="username" style="color: ${escapeHTML(userColor)}">${escapeHTML(username)}:</span>
        <span class="message-text">${parsedMsg}</span>`;

    // Tag for moderation targeting
    if (tags['id'])    el.dataset.msgId   = tags['id'];
    if (tags['login']) el.dataset.username = tags['login'].toLowerCase();

    container.appendChild(el);
    if (container.childNodes.length > 50) container.removeChild(container.firstChild);

    if (CONFIG.messageLifetime > 0) {
        setTimeout(() => {
            el.classList.add('fading-out');
            const fadeDuration = parseInt(CONFIG.fadeDuration) || 1000;
            setTimeout(() => el.remove(), fadeDuration);
        }, CONFIG.messageLifetime);
    }

    // Apply 7TV cosmetics (badge + paint) after render
    if (tags['user-id']) apply7TVCosmetics(tags['user-id'], el);
}
// Fired via raw_message in main.js (not a tmi.js named event) because Twitch
// delivers these as USERNOTICE with msg-id = "viewermilestone".

// Raw IRC emotes tag format: "id:start-end,start-end/id2:start-end"
// tmi.js parses this automatically for regular messages, but raw_message tags
// are unprocessed strings — so we convert them manually before passing to parseMessage.
function parseRawEmotesTag(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const result = {};
    for (const chunk of raw.split('/')) {
        const [id, positions] = chunk.split(':');
        if (id && positions) result[id] = positions.split(',');
    }
    return Object.keys(result).length ? result : null;
}

function handleWatchStreak(tags, message) {
    if (!CONFIG.showStreaks) return;
    const name   = tags['display-name'] || tags.username;
    const streak = tags['msg-param-value'] || '?';  // number of consecutive streams watched
    const verb   = CONFIG.streakLabel || 'is on a';
    const detail = `${verb} ${streak}-stream watch streak!`;
    // Parse the raw emotes string from IRC into the format parseMessage expects
    const parsedMsg = message && message.trim() ? parseMessage(message.trim(), parseRawEmotesTag(tags.emotes)) : '';
    displayEventMessage(ICON_STREAK, name, detail, parsedMsg, true, 'streak-message');
}

// ── Raids ──────────────────────────────────────────────────────────────────────

const ICON_RAID_IN = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2L2 7v2h2v9h4v-5h4v5h4V9h2V7L10 2z"/></svg>`;

// Incoming raid — someone is raiding this channel.
// tmi.js fires a dedicated 'raided' event for this, no raw_message needed.
function handleRaidIncoming(channel, username, viewers, tags) {
    if (!CONFIG.showRaidIncoming) return;
    const raw    = viewers ?? tags?.['msg-param-viewerCount'];
    const count  = Number(raw);
    const verb   = CONFIG.raidIncomingLabel || 'is raiding with';
    const detail = `${verb} ${count} viewer${count === 1 ? '' : 's'}!`;
    displayEventMessage(ICON_RAID_IN, username, detail, '', false, 'raid-incoming-message');
}

// Outgoing raid — we are raiding someone else.
// Fired via PubSub raid.<channelId> topic (raid_go_v2 event).
// IRC never fires for outgoing raids so PubSub is the only way to catch this.
const ICON_RAID_OUT = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l8 5v2h-2v9h-4v-5H8v5H4V9H2V7l8-5zm4 13v-7.764l-4-2.5-4 2.5V15h2v-5h4v5h2z"/></svg>`;

function handleRaidOutgoing(targetName, viewers) {
    if (!CONFIG.showRaidOutgoing) return;
    const count  = Number(viewers) || 0;
    const verb   = CONFIG.raidOutgoingLabel || 'raiding';
    const detail = `${verb} ${escapeHTML(targetName)} with ${count} viewer${count === 1 ? '' : 's'}!`;
    displayEventMessage(ICON_RAID_OUT, 'Outgoing Raid', detail, '', false, 'raid-outgoing-message');
}