// ─── config/generate.js ───────────────────────────────────────────────────────
// Builds the OBS overlay URL from current form state and handles copy-to-clipboard.

// ── Helpers ───────────────────────────────────────────────────────────────────

// Converts a #RRGGBB hex color + 0-100 opacity into an 8-char RRGGBBAA string
// used in the URL (no # prefix, to keep the URL compact).
function colorToHex8(hex, opacity) {
    const aa = Math.round(opacity / 100 * 255).toString(16).padStart(2, '0');
    return hex.slice(1) + aa; // RRGGBBAA, no #
}

// Shorthand helpers for reading form values
const v  = id => document.getElementById(id).value;    // text/number input value
const ch = id => document.getElementById(id).checked;  // checkbox state
const c8 = (colorId, opacityId) => colorToHex8(v(colorId), parseInt(v(opacityId))); // color+opacity → hex8

// ── Generate ──────────────────────────────────────────────────────────────────
function generateLink() {
    const channel = v('channel').trim();
    if (!channel) { alert('Please enter a channel name.'); return; }

    const token = localStorage.getItem('twitch_access_token') || '';
    const base  = window.location.href.replace('index.html', '');

    // When all badges are disabled we only need the one flag — skip the other badge params
    const badgeParams = ch('disableAllBadges')
        ? '&disableAllBadges=1'
        : `&roleOnlyBadges=${ch('roleOnlyBadges') ? '1':'0'}&showExternalCosmetics=${ch('showExternalCosmetics') ? '1':'0'}`;

    const showResubs     = ch('showResubs');
    const showGifts      = ch('showGifts');
    const showBits       = ch('showBits');
    const showRedeems    = ch('showRedeems');
    const showBans       = ch('showBans');
    const showTimeouts   = ch('showTimeouts');
    const showHighlights = ch('showHighlights');
    const showStreaks    = ch('showStreaks');

    const resubLabel  = v('resubLabel').trim();
    const giftLabel   = v('giftLabel').trim();
    const bitsLabel   = v('bitsLabel').trim();
    const redeemLabel = v('redeemLabel').trim();
    const streakLabel = v('streakLabel').trim();
    const fontUrl      = v('fontUrl').trim();
    const messageGap     = v('messageGap').trim();
    const lineHeight     = v('lineHeight').trim();
    const slideDistance   = v('slideDistance').trim()   || '20';
    const slideDuration   = v('slideDuration').trim()   || '300';
    const messageLifetime = v('messageLifetime').trim() || '0';
    const fadeDuration    = v('fadeDuration').trim()    || '1000';
    const excludedUsers    = v('excludedUsers').trim();
    const excludedPrefixes = v('excludedPrefixes').trim();

    // Each event type contributes its toggle, then colors and label only when enabled.
    // filter(Boolean) strips the false entries (disabled events skip their color params).
    const eventParams = [
        `showResubs=${showResubs ? '1':'0'}`,
        showResubs && `resubAccent=${c8('resubAccent','resubAccentOpacity')}`,
        showResubs && `resubBg=${c8('resubBg','resubBgOpacity')}`,
        showResubs && resubLabel  && `resubLabel=${encodeURIComponent(resubLabel)}`,

        `showGifts=${showGifts ? '1':'0'}`,
        showGifts && `giftAccent=${c8('giftAccent','giftAccentOpacity')}`,
        showGifts && `giftBg=${c8('giftBg','giftBgOpacity')}`,
        showGifts && giftLabel    && `giftLabel=${encodeURIComponent(giftLabel)}`,

        `showBits=${showBits ? '1':'0'}`,
        showBits && `bitsAccent=${c8('bitsAccent','bitsAccentOpacity')}`,
        showBits && `bitsBg=${c8('bitsBg','bitsBgOpacity')}`,
        showBits && bitsLabel     && `bitsLabel=${encodeURIComponent(bitsLabel)}`,

        `showRedeems=${showRedeems ? '1':'0'}`,
        showRedeems && `redeemAccent=${c8('redeemAccent','redeemAccentOpacity')}`,
        showRedeems && `redeemBg=${c8('redeemBg','redeemBgOpacity')}`,
        showRedeems && redeemLabel && `redeemLabel=${encodeURIComponent(redeemLabel)}`,

        `showBans=${showBans ? '1':'0'}`,
        showBans     && `banAccent=${c8('banAccent','banAccentOpacity')}`,
        showBans     && `banBg=${c8('banBg','banBgOpacity')}`,
        `showTimeouts=${showTimeouts ? '1':'0'}`,
        showTimeouts && `timeoutAccent=${c8('timeoutAccent','timeoutAccentOpacity')}`,
        showTimeouts && `timeoutBg=${c8('timeoutBg','timeoutBgOpacity')}`,
        `showHighlights=${showHighlights ? '1':'0'}`,
        showHighlights && `highlightAccent=${c8('highlightAccent','highlightAccentOpacity')}`,
        showHighlights && `highlightBg=${c8('highlightBg','highlightBgOpacity')}`,

        `showStreaks=${showStreaks ? '1':'0'}`,
        showStreaks && `streakAccent=${c8('streakAccent','streakAccentOpacity')}`,
        showStreaks && `streakBg=${c8('streakBg','streakBgOpacity')}`,
        showStreaks && streakLabel && `streakLabel=${encodeURIComponent(streakLabel)}`,

        `showRaidIncoming=${ch('showRaidIncoming') ? '1':'0'}`,
        ch('showRaidIncoming') && `raidIncomingAccent=${c8('raidIncomingAccent','raidIncomingAccentOpacity')}`,
        ch('showRaidIncoming') && `raidIncomingBg=${c8('raidIncomingBg','raidIncomingBgOpacity')}`,
        ch('showRaidIncoming') && v('raidIncomingLabel').trim() && `raidIncomingLabel=${encodeURIComponent(v('raidIncomingLabel').trim())}`,
        `showRaidOutgoing=${ch('showRaidOutgoing') ? '1':'0'}`,
        ch('showRaidOutgoing') && `raidOutgoingAccent=${c8('raidOutgoingAccent','raidOutgoingAccentOpacity')}`,
        ch('showRaidOutgoing') && `raidOutgoingBg=${c8('raidOutgoingBg','raidOutgoingBgOpacity')}`,
        ch('showRaidOutgoing') && v('raidOutgoingLabel').trim() && `raidOutgoingLabel=${encodeURIComponent(v('raidOutgoingLabel').trim())}`,
        `showPolls=${ch('showPolls') ? '1':'0'}`,
        ch('showPolls') && `pollAccent=${c8('pollAccent','pollAccentOpacity')}`,
        ch('showPolls') && `pollBg=${c8('pollBg','pollBgOpacity')}`,
        ch('showPolls') && `pollBar=${c8('pollBar','pollBarOpacity')}`,
        ch('showPolls') && `pollWinner=${c8('pollWinner','pollWinnerOpacity')}`,
        ch('showPolls') && v('pollLingerMs') && `pollLingerMs=${v('pollLingerMs')}`,
        `showPredictions=${ch('showPredictions') ? '1':'0'}`,
        ch('showPredictions') && `predBg=${c8('predBg','predBgOpacity')}`,
        ch('showPredictions') && `predWinnerGlow=${c8('predWinnerGlow','predWinnerGlowOpacity')}`,
        ch('showPredictions') && v('predictionLingerMs') && `predictionLingerMs=${v('predictionLingerMs')}`,
        `showHypeTrain=${ch('showHypeTrain') ? '1':'0'}`,
        ch('showHypeTrain') && `htAccent=${c8('htAccent','htAccentOpacity')}`,
        ch('showHypeTrain') && `htBg=${c8('htBg','htBgOpacity')}`,
        ch('showHypeTrain') && `htBar=${c8('htBar','htBarOpacity')}`,
        ch('showHypeTrain') && v('hypeTrainLingerMs') && `hypeTrainLingerMs=${v('hypeTrainLingerMs')}`,
    ].filter(Boolean).join('&');

    const fontParams = fontUrl ? `fontUrl=${encodeURIComponent(fontUrl)}` : '';

    const url = `${base}overlay.html#channel=${encodeURIComponent(channel)}&nameFontSize=${v('nameFontSize')}px&messageFontSize=${v('messageFontSize')}px&shadow=${c8('shadowColor','shadowOpacity')}${fontParams ? '&'+fontParams : ''}${messageGap ? '&messageGap='+messageGap : ''}${lineHeight ? '&lineHeight='+lineHeight : ''}&slideDistance=${slideDistance}&slideDuration=${slideDuration}&messageLifetime=${messageLifetime}&fadeDuration=${fadeDuration}${excludedUsers ? '&exclude='+encodeURIComponent(excludedUsers) : ''}${excludedPrefixes ? '&excludePrefix='+encodeURIComponent(excludedPrefixes) : ''}${!ch('showReplies') ? '&showReplies=0' : ''}${v('meStyle') !== 'colored' ? '&meStyle='+v('meStyle') : ''}${!ch('showAnnouncements') ? '&showAnnouncements=0' : ''}&toastEmotes=${ch('toastEmotes') ? '1':'0'}&${eventParams}${badgeParams}&token=${encodeURIComponent(token)}`;

    document.getElementById('resultLink').textContent = url;

    const copyBtn = document.getElementById('copyBtn');
    copyBtn.style.display = 'flex';
    copyBtn.classList.remove('copied');
    document.getElementById('copyBtnLabel').textContent = 'Copy Link';
}

// ── Copy ──────────────────────────────────────────────────────────────────────
function copyLink() {
    const url = document.getElementById('resultLink').textContent;
    if (!url || url.startsWith('Click')) return;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.classList.add('copied');
        document.getElementById('copyBtnLabel').textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            document.getElementById('copyBtnLabel').textContent = 'Copy Link';
        }, 2000);
    });
}

// ── Export / Import ───────────────────────────────────────────────────────────

// All form field IDs and their types. Used by exportConfig/importConfig to
// snapshot and restore every setting. Token is intentionally excluded —
// whoever imports will authenticate with their own Twitch account.
// ⚠️ Add new fields here whenever a new configurable option is introduced.
const CONFIG_FIELDS = [
    // General
    { id: 'channel',       type: 'text' },
    { id: 'nameFontSize',    type: 'text' },
    { id: 'messageFontSize', type: 'text' },
    { id: 'shadowColor',   type: 'text' },
    { id: 'shadowOpacity', type: 'text' },
    { id: 'messageGap',      type: 'text' },
    { id: 'lineHeight',      type: 'text' },
    { id: 'slideDistance',   type: 'text' },
    { id: 'slideDuration',   type: 'text' },
    { id: 'messageLifetime', type: 'text' },
    { id: 'fadeDuration',    type: 'text' },
    { id: 'excludedUsers',    type: 'text'  },
    { id: 'excludedPrefixes', type: 'text'  },
    { id: 'showReplies',        type: 'check' },
    { id: 'meStyle',            type: 'text'  },
    { id: 'showAnnouncements',  type: 'check' },
    { id: 'fontUrl',       type: 'text' },
    // Events — toggles
    { id: 'showResubs',     type: 'check' },
    { id: 'showGifts',      type: 'check' },
    { id: 'showBits',       type: 'check' },
    { id: 'showRedeems',    type: 'check' },
    { id: 'showBans',       type: 'check' },
    { id: 'banAccent',      type: 'text' }, { id: 'banAccentOpacity',     type: 'text' },
    { id: 'banBg',          type: 'text' }, { id: 'banBgOpacity',         type: 'text' },
    { id: 'showTimeouts',   type: 'check' },
    { id: 'timeoutAccent',  type: 'text' }, { id: 'timeoutAccentOpacity', type: 'text' },
    { id: 'timeoutBg',      type: 'text' }, { id: 'timeoutBgOpacity',     type: 'text' },
    { id: 'showHighlights', type: 'check' },
    { id: 'showStreaks',    type: 'check' },
    // Events — colors
    { id: 'resubAccent',        type: 'text' }, { id: 'resubAccentOpacity',    type: 'text' },
    { id: 'resubBg',            type: 'text' }, { id: 'resubBgOpacity',        type: 'text' },
    { id: 'resubLabel',         type: 'text' },
    { id: 'giftAccent',         type: 'text' }, { id: 'giftAccentOpacity',     type: 'text' },
    { id: 'giftBg',             type: 'text' }, { id: 'giftBgOpacity',         type: 'text' },
    { id: 'giftLabel',          type: 'text' },
    { id: 'bitsAccent',         type: 'text' }, { id: 'bitsAccentOpacity',     type: 'text' },
    { id: 'bitsBg',             type: 'text' }, { id: 'bitsBgOpacity',         type: 'text' },
    { id: 'bitsLabel',          type: 'text' },
    { id: 'redeemAccent',       type: 'text' }, { id: 'redeemAccentOpacity',   type: 'text' },
    { id: 'redeemBg',           type: 'text' }, { id: 'redeemBgOpacity',       type: 'text' },
    { id: 'redeemLabel',        type: 'text' },
    { id: 'highlightAccent',    type: 'text' }, { id: 'highlightAccentOpacity',type: 'text' },
    { id: 'highlightBg',        type: 'text' }, { id: 'highlightBgOpacity',    type: 'text' },
    { id: 'streakAccent',       type: 'text' }, { id: 'streakAccentOpacity',   type: 'text' },
    { id: 'streakBg',           type: 'text' }, { id: 'streakBgOpacity',       type: 'text' },
    { id: 'streakLabel',        type: 'text' },
    // Raids
    { id: 'showRaidIncoming',       type: 'check' },
    { id: 'raidIncomingAccent',     type: 'text' }, { id: 'raidIncomingAccentOpacity', type: 'text' },
    { id: 'raidIncomingBg',         type: 'text' }, { id: 'raidIncomingBgOpacity',     type: 'text' },
    { id: 'raidIncomingLabel',      type: 'text' },
    { id: 'showRaidOutgoing',       type: 'check' },
    { id: 'raidOutgoingAccent',     type: 'text' }, { id: 'raidOutgoingAccentOpacity', type: 'text' },
    { id: 'raidOutgoingBg',         type: 'text' }, { id: 'raidOutgoingBgOpacity',     type: 'text' },
    { id: 'raidOutgoingLabel',      type: 'text' },
    { id: 'showPolls',              type: 'check' },
    { id: 'pollAccent',             type: 'text' }, { id: 'pollAccentOpacity',  type: 'text' },
    { id: 'pollBg',                 type: 'text' }, { id: 'pollBgOpacity',      type: 'text' },
    { id: 'pollBar',                type: 'text' }, { id: 'pollBarOpacity',     type: 'text' },
    { id: 'pollWinner',             type: 'text' }, { id: 'pollWinnerOpacity',  type: 'text' },
    { id: 'pollLingerMs',           type: 'text' },
    { id: 'showPredictions',        type: 'check' },
    { id: 'predBg',                 type: 'text' }, { id: 'predBgOpacity',          type: 'text' },
    { id: 'predWinnerGlow',         type: 'text' }, { id: 'predWinnerGlowOpacity',  type: 'text' },
    { id: 'predictionLingerMs',     type: 'text' },
    { id: 'showHypeTrain',          type: 'check' },
    { id: 'htAccent',               type: 'text' }, { id: 'htAccentOpacity',  type: 'text' },
    { id: 'htBg',                   type: 'text' }, { id: 'htBgOpacity',      type: 'text' },
    { id: 'htBar',                  type: 'text' }, { id: 'htBarOpacity',     type: 'text' },
    { id: 'hypeTrainLingerMs',      type: 'text' },
    // Badges & Cosmetics
    { id: 'disableAllBadges',     type: 'check' },
    { id: 'roleOnlyBadges',       type: 'check' },
    { id: 'showExternalCosmetics',type: 'check' },
    { id: 'toastEmotes',          type: 'check' },
];

// Serialises all form values to JSON, then base64-encodes it into a
// shareable alphanumeric string that can be pasted into importConfig().
function exportConfig() {
    const data = {};
    CONFIG_FIELDS.forEach(({ id, type }) => {
        const el = document.getElementById(id);
        if (!el) return;
        data[id] = type === 'check' ? el.checked : el.value;
    });

    const json    = JSON.stringify(data);
    const encoded = btoa(json);                  // base64 → alphanumeric string

    document.getElementById('exportLabel').style.display    = 'block';
    document.getElementById('exportBox').style.display      = 'block';
    document.getElementById('exportBox').textContent        = encoded;
    document.getElementById('copyExportBtn').style.display  = 'flex';
    document.getElementById('copyExportBtnLabel').textContent = 'Copy Config String';
    document.getElementById('copyExportBtn').classList.remove('copied');
}

// Decodes a config string produced by exportConfig() and restores every
// field, firing change/input events so dependent UI (opacity labels,
// event colour panels, badge disabling) updates automatically.
function importConfig() {
    const input = prompt('Paste your config string:');
    if (!input) return;
    let data;
    try {
        data = JSON.parse(atob(input.trim()));
    } catch {
        alert('Invalid config string — make sure you pasted it correctly.');
        return;
    }

    CONFIG_FIELDS.forEach(({ id, type }) => {
        if (!(id in data)) return;
        const el = document.getElementById(id);
        if (!el) return;
        if (type === 'check') {
            el.checked = data[id];
            // Fire onchange handlers so dependent UI updates
            el.dispatchEvent(new Event('change'));
        } else {
            el.value = data[id];
            // Fire input so opacity labels update
            el.dispatchEvent(new Event('input'));
        }
    });

    // Hide any stale export box
    document.getElementById('exportLabel').style.display   = 'none';
    document.getElementById('exportBox').style.display     = 'none';
    document.getElementById('copyExportBtn').style.display = 'none';

    alert('Config imported! Review the settings and click "Generate Link" when ready.');
}

function copyExport() {
    const str = document.getElementById('exportBox').textContent;
    if (!str) return;
    navigator.clipboard.writeText(str).then(() => {
        const btn = document.getElementById('copyExportBtn');
        btn.classList.add('copied');
        document.getElementById('copyExportBtnLabel').textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            document.getElementById('copyExportBtnLabel').textContent = 'Copy Config String';
        }, 2000);
    });
}