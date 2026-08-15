// ─── config/tooltips.js ───────────────────────────────────────────────────────
// Injects a ⓘ indicator next to every setting label.
// Hovering shows a plain description tooltip.
// Live visual previews have moved to the chat preview panel on the right.

// ── Color helpers (kept for potential future use) ─────────────────────────────
function _hex(id, fallback = '#888888') {
    return document.getElementById(id)?.value || fallback;
}
function _op(id, fallback = 100) {
    return parseInt(document.getElementById(id)?.value ?? fallback);
}

// ── Settings map ──────────────────────────────────────────────────────────────
// Each entry has a `desc` string shown in the tooltip.
const SETTING_TIPS = {
    channel:           { desc: 'The Twitch channel name to connect to.' },
    nameFontSize:      { desc: 'Size of the username text in chat messages.' },
    messageFontSize:   { desc: 'Size of the message body text in chat messages.' },
    shadowColor:       { desc: 'Drop-shadow color and opacity applied behind usernames.' },
    shadowSize:        { desc: 'How far the shadow stretches from the text, like a cast shadow at different times of day.' },
    shadowAngle:       { desc: 'Direction the shadow points. Drag the dial or click a spot on it — 12 o\u2019clock is up, and it moves clockwise from there.' },
    fontUrl:           { desc: 'URL of a custom web font (e.g. a Google Fonts CSS link). Leave blank for the default font.' },
    messageGap:        { desc: 'Vertical space between chat messages (px). Leave blank for default.' },
    lineHeight:        { desc: 'Line spacing within a message. Leave blank for default (e.g. 1.4).' },
    slideDistance:     { desc: 'How far new messages slide up from below before settling (px).' },
    slideDuration:     { desc: 'How long the slide-in animation takes (ms).' },
    messageLifetime:   { desc: 'How many ms before a message fades out. 0 = stay on screen forever.' },
    fadeDuration:      { desc: 'How long the fade-out animation takes (ms).' },
    excludedUsers:     { desc: 'Comma-separated usernames to hide (e.g. Nightbot, StreamElements).' },
    excludedPrefixes:  { desc: 'Hide messages starting with these prefixes. Comma-separated (e.g. ! hides bot commands).' },
    showAnnouncements: { desc: 'Show /announce messages posted by mods or the broadcaster.' },
    showReplies:       { desc: 'Show the quoted parent message above reply messages.' },
    toastEmotes:       { desc: 'Displays a notification when a 7TV emote is added to or removed from the current set.' },
    meStyle:           { desc: 'How /me action messages are styled — colored (uses name color), italic, or plain.' },
    disableAllBadges:      { desc: 'Hide every badge — Twitch, 7TV, FFZ, and Chatterino.' },
    roleOnlyBadges:        { desc: 'Only show Broadcaster, Mod, and VIP badges.' },
    showExternalCosmetics: { desc: 'Show third-party badges and name paints from 7TV, BTTV, and FFZ.' },

    showResubs:  { desc: 'Show an event message when someone subscribes or resubscribes.' },
    resubAccent: { desc: 'Border and icon color for resub event messages.' },
    resubBg:     { desc: 'Background color for resub event messages.' },
    resubLabel:  { desc: 'Custom verb in resub messages (e.g. "subscribed", "joined the crew").' },

    showGifts:   { desc: 'Show an event message when someone gifts subscriptions.' },
    giftAccent:  { desc: 'Border and icon color for gift sub messages.' },
    giftBg:      { desc: 'Background color for gift sub messages.' },
    giftLabel:   { desc: 'Custom verb in gift messages (e.g. "gifted", "sent").' },

    showBits:    { desc: 'Show an event message when someone cheers with bits.' },
    bitsAccent:  { desc: 'Border and icon color for cheer messages.' },
    bitsBg:      { desc: 'Background color for cheer messages.' },
    bitsLabel:   { desc: 'Custom verb in cheer messages (e.g. "cheered", "tossed").' },

    showRedeems:  { desc: 'Show an event message for channel point redemptions. Requires your own token.' },
    redeemAccent: { desc: 'Border and icon color for redemption messages.' },
    redeemBg:     { desc: 'Background color for redemption messages.' },
    redeemLabel:  { desc: 'Custom verb in redemption messages (e.g. "redeemed", "claimed").' },

    showBans:  { desc: 'Play the hammer animation when a user is banned.' },
    banAccent: { desc: 'Accent color for the ban animation.' },
    banBg:     { desc: 'Background color behind the ban animation.' },

    showTimeouts:  { desc: 'Play the clock animation when a user is timed out.' },
    timeoutAccent: { desc: 'Accent color for the timeout animation.' },
    timeoutBg:     { desc: 'Background color behind the timeout animation.' },

    showHighlights:  { desc: 'Show highlighted messages with a distinct background and border.' },
    highlightAccent: { desc: 'Border and glow color for highlighted messages.' },
    highlightBg:     { desc: 'Background color for highlighted messages.' },

    showStreaks:  { desc: 'Show an event message for watch streak milestones.' },
    streakAccent: { desc: 'Border and icon color for watch streak messages.' },
    streakBg:     { desc: 'Background color for watch streak messages.' },
    streakLabel:  { desc: 'Custom label text in watch streak messages (e.g. "is on a").' },

    showRaidIncoming:   { desc: 'Show an event message when another channel raids you.' },
    raidIncomingAccent: { desc: 'Border and icon color for incoming raid messages.' },
    raidIncomingBg:     { desc: 'Background color for incoming raid messages.' },
    raidIncomingLabel:  { desc: 'Custom verb in incoming raid messages (e.g. "is raiding with").' },

    showRaidOutgoing:   { desc: 'Show an event message when you raid another channel. Requires your own token.' },
    raidOutgoingAccent: { desc: 'Border and icon color for outgoing raid messages.' },
    raidOutgoingBg:     { desc: 'Background color for outgoing raid messages.' },
    raidOutgoingLabel:  { desc: 'Custom verb in outgoing raid messages (e.g. "raiding").' },

    showPolls:    { desc: 'Show an active poll widget in the center of the overlay. Requires your own token.' },
    pollAccent:   { desc: 'Border, icon, and percentage text color for the poll widget.' },
    pollBg:       { desc: 'Background color for the poll widget.' },
    pollBar:      { desc: 'Fill color for poll vote bars.' },
    pollWinner:   { desc: 'Color used to highlight the winning choice when the poll ends.' },
    pollLingerMs: { desc: 'How long (ms) the poll widget stays visible after the poll ends.' },

    showPredictions:    { desc: 'Show an active prediction widget in the center of the overlay. Requires your own token.' },
    predBg:             { desc: 'Background color for the prediction widget.' },
    predWinnerGlow:     { desc: 'Glow color pulsed on the widget border when a prediction is resolved.' },
    predictionLingerMs: { desc: 'How long (ms) the prediction widget stays visible after locking, resolving, or canceling.' },

    showHypeTrain:     { desc: 'Show a hype train progress bar at the top of the overlay. Requires your own token.' },
    htAccent:          { desc: 'Border, icon, and label color for the hype train widget.' },
    htBg:              { desc: 'Background color for the hype train widget.' },
    htBar:             { desc: 'Fill color of the hype train progress bar.' },
    hypeTrainLingerMs: { desc: 'How long (ms) the hype train widget stays visible after the train ends.' },
};

// ── Tooltip DOM ───────────────────────────────────────────────────────────────
let _tipEl        = null;
let _activeTip    = null;
let _activeAnchor = null;
let _hideTimer    = null;

function _createTooltip() {
    _tipEl = document.createElement('div');
    _tipEl.className = 'setting-tooltip';
    _tipEl.style.display = 'none';
    document.body.appendChild(_tipEl);
}

function _positionTip(anchor) {
    const tipW = 240;
    const r    = anchor.getBoundingClientRect();
    let left   = r.left + r.width / 2 - tipW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
    if (r.top > 80) {
        _tipEl.style.top       = (r.top - 8 + window.scrollY) + 'px';
        _tipEl.style.transform = 'translateY(-100%)';
    } else {
        _tipEl.style.top       = (r.bottom + 6 + window.scrollY) + 'px';
        _tipEl.style.transform = 'translateY(0)';
    }
    _tipEl.style.left  = left + 'px';
    _tipEl.style.width = tipW + 'px';
}

function _showTip(tip, anchor) {
    if (!_tipEl) return;
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    _activeTip    = tip;
    _activeAnchor = anchor;
    _tipEl.innerHTML = `<div class="tip-desc">${tip.desc}</div>`;
    _tipEl.style.display = 'block';
    _positionTip(anchor);
}

function _hideTip() {
    if (!_tipEl) return;
    // Small delay so moving the cursor doesn't flicker if the user brushes the icon edge
    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
        _tipEl.style.display = 'none';
        _activeTip    = null;
        _activeAnchor = null;
        _hideTimer    = null;
    }, 80);
}

// ── Injection ─────────────────────────────────────────────────────────────────
function injectSettingTips() {
    _createTooltip();

    Object.entries(SETTING_TIPS).forEach(([id, tip]) => {
        const el = document.getElementById(id);
        if (!el) return;

        let labelTarget = null;

        // 1 — checkbox → .cb-label
        const wrapper = el.closest('.checkbox-wrapper');
        if (wrapper) labelTarget = wrapper.querySelector('.cb-label');

        // 2 — row → .option-label in same row
        if (!labelTarget) {
            const row = el.closest('.event-option-row, .text-override-row');
            if (row) labelTarget = row.querySelector('.option-label');
        }

        // 3 — preceding sibling .field-label
        if (!labelTarget) {
            let sib = el.previousElementSibling;
            while (sib) {
                if (sib.classList.contains('field-label')) { labelTarget = sib; break; }
                sib = sib.previousElementSibling;
            }
        }

        // 4 — fallback: nearest .tab-section-title
        if (!labelTarget) {
            const section = el.closest('.tab-section');
            if (section) labelTarget = section.querySelector('.tab-section-title');
        }

        if (!labelTarget || labelTarget.querySelector('.setting-tip-icon')) return;

        const icon = document.createElement('span');
        icon.className = 'setting-tip-icon';
        icon.textContent = 'ⓘ';
        icon.addEventListener('mouseenter', () => _showTip(tip, icon));
        icon.addEventListener('mouseleave', _hideTip);
        labelTarget.appendChild(icon);
    });
}

document.addEventListener('DOMContentLoaded', injectSettingTips);