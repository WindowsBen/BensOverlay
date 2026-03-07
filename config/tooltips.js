// ─── config/tooltips.js ───────────────────────────────────────────────────────
// Injects a small ⓘ indicator next to every labelled setting in the
// configurator. Hovering the indicator shows a tooltip describing what
// the setting does.
//
// To add a tip for a new setting, add its input element ID to SETTING_TIPS.

const SETTING_TIPS = {
    // ── General ────────────────────────────────────────────────────────────
    channel:           'The Twitch channel name to connect to (without the #).',
    token:             'Your Twitch OAuth token. Required for badges and PubSub features.',
    nameFontSize:      'Size of the username text in chat messages.',
    messageFontSize:   'Size of the message body text in chat messages.',
    shadowColor:       'Drop-shadow color applied behind usernames.',
    fontUrl:           'URL of a custom web font (e.g. a Google Fonts CSS link). Leave blank to use the default font.',
    messageGap:        'Vertical space between individual chat messages (px). Leave blank for default.',
    lineHeight:        'Line spacing within a message. Leave blank for default (e.g. 1.4).',
    slideDistance:     'How far new messages slide in from below before settling (px).',
    slideDuration:     'How long the slide-in animation takes (ms).',
    messageLifetime:   'How many ms before a message fades out. Set to 0 to keep messages on screen forever.',
    fadeDuration:      'How long the fade-out animation takes (ms).',
    excludedUsers:     'Comma-separated list of usernames whose messages are hidden (e.g. bots).',
    excludedPrefixes:  'Hide messages that start with these prefixes. Comma-separated (e.g. ! to hide bot commands).',
    showAnnouncements: 'Show /announce messages from mods and the broadcaster.',
    showReplies:       'Show the quoted parent message above reply messages.',
    toastEmotes:       'When an emote-only message is sent, float the emote above chat as a toast.',
    meStyle:           'How /me action messages are styled — colored (uses username color), italic, or plain.',

    // ── Appearance ─────────────────────────────────────────────────────────
    disableAllBadges:       'Hide every badge from every source (Twitch, 7TV, FFZ, Chatterino).',
    roleOnlyBadges:         'Only show Broadcaster, Mod, and VIP badges. All other badges are hidden.',
    showExternalCosmetics:  'Show third-party badges and name paints from 7TV, BTTV, and FFZ.',

    // ── Events — shared color labels ────────────────────────────────────────
    resubAccent:       'Border and icon color for resub event messages.',
    resubBg:           'Background color for resub event messages.',
    resubLabel:        'Custom verb shown in resub messages (default: "subscribed for").',
    giftAccent:        'Border and icon color for gifted sub messages.',
    giftBg:            'Background color for gifted sub messages.',
    giftLabel:         'Custom verb shown in gift messages (default: "gifted a sub to").',
    bitsAccent:        'Border and icon color for cheer/bits messages.',
    bitsBg:            'Background color for cheer/bits messages.',
    bitsLabel:         'Custom verb shown in cheer messages (default: "cheered").',
    redeemAccent:      'Border and icon color for channel point redemption messages.',
    redeemBg:          'Background color for channel point redemption messages.',
    redeemLabel:       'Custom verb shown in redemption messages (default: "redeemed").',
    banAccent:         'Accent color for the ban animation overlay.',
    banBg:             'Background color for the ban animation overlay.',
    timeoutAccent:     'Accent color for the timeout animation overlay.',
    timeoutBg:         'Background color for the timeout animation overlay.',
    highlightAccent:   'Border and glow color for highlighted messages.',
    highlightBg:       'Background color for highlighted messages.',
    streakAccent:      'Border and icon color for watch streak messages.',
    streakBg:          'Background color for watch streak messages.',
    streakLabel:       'Custom text shown in watch streak messages.',
    raidIncomingAccent: 'Border and icon color for incoming raid messages.',
    raidIncomingBg:    'Background color for incoming raid messages.',
    raidIncomingLabel: 'Custom verb shown in incoming raid messages (default: "is raiding with").',
    raidOutgoingAccent: 'Border and icon color for outgoing raid messages.',
    raidOutgoingBg:    'Background color for outgoing raid messages.',
    raidOutgoingLabel: 'Custom verb shown in outgoing raid messages (default: "raiding").',

    // ── Event toggles ───────────────────────────────────────────────────────
    showResubs:        'Show an event message when someone resubscribes or subscribes.',
    showGifts:         'Show an event message when someone gifts subscriptions.',
    showBits:          'Show an event message when someone cheers with bits.',
    showRedeems:       'Show an event message for channel point redemptions. Requires your own token.',
    showBans:          'Play the hammer animation when a user is banned.',
    showTimeouts:      'Play the clock animation when a user is timed out.',
    showHighlights:    'Show highlighted messages with a distinct background and border.',
    showStreaks:       'Show an event message for watch streak milestones.',
    showRaidIncoming:  'Show an event message when another channel raids you.',
    showRaidOutgoing:  'Show an event message when you raid another channel. Requires your own token.',

    // ── Polls ───────────────────────────────────────────────────────────────
    showPolls:         'Show an active poll as a widget in the center of the overlay. Requires your own token.',
    pollAccent:        'Border, icon, and percentage text color for the poll widget.',
    pollBg:            'Background color for the poll widget.',
    pollBar:           'Fill color for poll vote bars.',
    pollWinner:        'Color used to highlight the winning choice when the poll ends.',
    pollLingerMs:      'How long (ms) the poll widget stays visible after the poll ends.',

    // ── Predictions ─────────────────────────────────────────────────────────
    showPredictions:    'Show an active prediction as a widget in the center of the overlay. Requires your own token.',
    predBg:             'Background color for the prediction widget.',
    predWinnerGlow:     'Glow color pulsed on the widget border when a prediction is resolved.',
    predictionLingerMs: 'How long (ms) the prediction widget stays visible after locking, resolving, or canceling.',

    // ── Hype Train ──────────────────────────────────────────────────────────
    showHypeTrain:      'Show a hype train progress bar at the top of the overlay. Requires your own token.',
    htAccent:           'Border, icon, and label color for the hype train widget.',
    htBg:               'Background color for the hype train widget.',
    htBar:              'Fill color of the hype train progress bar.',
    hypeTrainLingerMs:  'How long (ms) the hype train widget stays visible after the train ends.',
};

// ── Tooltip DOM ───────────────────────────────────────────────────────────────
let _tipEl = null;

function _createTooltip() {
    _tipEl = document.createElement('div');
    _tipEl.className = 'setting-tooltip';
    _tipEl.style.display = 'none';
    document.body.appendChild(_tipEl);
}

function _showTip(text, anchor) {
    if (!_tipEl) return;
    _tipEl.textContent = text;
    _tipEl.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    // Position above the anchor, centered, flip below if too close to top
    const tipW = 240;
    let left = r.left + r.width / 2 - tipW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
    const spaceAbove = r.top;
    if (spaceAbove > 60) {
        _tipEl.style.top  = (r.top - 8 + window.scrollY) + 'px';
        _tipEl.style.transform = 'translateY(-100%)';
    } else {
        _tipEl.style.top  = (r.bottom + 6 + window.scrollY) + 'px';
        _tipEl.style.transform = 'translateY(0)';
    }
    _tipEl.style.left = left + 'px';
    _tipEl.style.width = tipW + 'px';
}

function _hideTip() {
    if (_tipEl) _tipEl.style.display = 'none';
}

// ── Injection ─────────────────────────────────────────────────────────────────
// Finds the label associated with each setting ID and appends a ⓘ indicator.
function injectSettingTips() {
    _createTooltip();

    Object.entries(SETTING_TIPS).forEach(([id, tipText]) => {
        const el = document.getElementById(id);
        if (!el) return;

        // Find the best label element to attach the indicator to
        let labelTarget = null;

        // Case 1: checkbox inside a .checkbox-wrapper — attach to .cb-label span
        const wrapper = el.closest('.checkbox-wrapper');
        if (wrapper) {
            labelTarget = wrapper.querySelector('.cb-label');
        }

        // Case 2: color/number/text input inside .event-option-row or .text-override-row
        // — attach to the preceding .option-label span
        if (!labelTarget) {
            const row = el.closest('.event-option-row, .text-override-row');
            if (row) {
                labelTarget = row.querySelector('.option-label');
            }
        }

        // Case 3: standalone input (channel, token, font fields) — find nearest label
        if (!labelTarget) {
            const section = el.closest('.tab-section, .tab-section-inner');
            if (section) {
                // Look for a label[for=id] in the section
                labelTarget = section.querySelector(`label[for="${id}"]`);
            }
        }

        if (!labelTarget) return;

        // Don't add a second indicator if already injected
        if (labelTarget.querySelector('.setting-tip-icon')) return;

        const icon = document.createElement('span');
        icon.className = 'setting-tip-icon';
        icon.textContent = 'ⓘ';
        icon.addEventListener('mouseenter', e => _showTip(tipText, icon));
        icon.addEventListener('mouseleave', _hideTip);
        labelTarget.appendChild(icon);
    });
}

document.addEventListener('DOMContentLoaded', injectSettingTips);