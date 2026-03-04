// ─── config/generate.js ───────────────────────────────────────────────────────
// Builds the OBS overlay URL from current form state and handles copy-to-clipboard.

// ── Helpers ───────────────────────────────────────────────────────────────────
function colorToHex8(hex, opacity) {
    const aa = Math.round(opacity / 100 * 255).toString(16).padStart(2, '0');
    return hex.slice(1) + aa; // RRGGBBAA, no #
}

const v  = id => document.getElementById(id).value;
const ch = id => document.getElementById(id).checked;
const c8 = (colorId, opacityId) => colorToHex8(v(colorId), parseInt(v(opacityId)));

// ── Generate ──────────────────────────────────────────────────────────────────
function generateLink() {
    const channel = v('channel').trim();
    if (!channel) { alert('Please enter a channel name.'); return; }

    const token = localStorage.getItem('twitch_access_token') || '';
    const base  = window.location.href.replace('index.html', '');

    const badgeParams = ch('disableAllBadges')
        ? '&disableAllBadges=1'
        : `&roleOnlyBadges=${ch('roleOnlyBadges') ? '1':'0'}&showExternalCosmetics=${ch('showExternalCosmetics') ? '1':'0'}`;

    const showResubs     = ch('showResubs');
    const showGifts      = ch('showGifts');
    const showBits       = ch('showBits');
    const showRedeems    = ch('showRedeems');
    const showHighlights = ch('showHighlights');
    const showStreaks    = ch('showStreaks');

    const resubLabel  = v('resubLabel').trim();
    const giftLabel   = v('giftLabel').trim();
    const bitsLabel   = v('bitsLabel').trim();
    const redeemLabel = v('redeemLabel').trim();
    const streakLabel = v('streakLabel').trim();
    const fontUrl      = v('fontUrl').trim();
    const messageGap   = v('messageGap').trim();
    const lineHeight   = v('lineHeight').trim();
    const excludedUsers    = v('excludedUsers').trim();
    const excludedPrefixes = v('excludedPrefixes').trim();

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

        `showHighlights=${showHighlights ? '1':'0'}`,
        showHighlights && `highlightAccent=${c8('highlightAccent','highlightAccentOpacity')}`,
        showHighlights && `highlightBg=${c8('highlightBg','highlightBgOpacity')}`,

        `showStreaks=${showStreaks ? '1':'0'}`,
        showStreaks && `streakAccent=${c8('streakAccent','streakAccentOpacity')}`,
        showStreaks && `streakBg=${c8('streakBg','streakBgOpacity')}`,
        showStreaks && streakLabel && `streakLabel=${encodeURIComponent(streakLabel)}`,
    ].filter(Boolean).join('&');

    const fontParams = fontUrl ? `fontUrl=${encodeURIComponent(fontUrl)}` : '';

    const url = `${base}overlay.html#channel=${encodeURIComponent(channel)}&fontSize=${v('fontSize')}px&shadow=${c8('shadowColor','shadowOpacity')}${fontParams ? '&'+fontParams : ''}${messageGap ? '&messageGap='+messageGap : ''}${lineHeight ? '&lineHeight='+lineHeight : ''}${excludedUsers ? '&exclude='+encodeURIComponent(excludedUsers) : ''}${excludedPrefixes ? '&excludePrefix='+encodeURIComponent(excludedPrefixes) : ''}${!ch('showReplies') ? '&showReplies=0' : ''}${v('meStyle') !== 'colored' ? '&meStyle='+v('meStyle') : ''}&toastEmotes=${ch('toastEmotes') ? '1':'0'}&${eventParams}${badgeParams}&token=${encodeURIComponent(token)}`;

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

// All form field IDs to capture — token intentionally excluded
const CONFIG_FIELDS = [
    // General
    { id: 'channel',       type: 'text' },
    { id: 'fontSize',      type: 'text' },
    { id: 'shadowColor',   type: 'text' },
    { id: 'shadowOpacity', type: 'text' },
    { id: 'messageGap',    type: 'text' },
    { id: 'lineHeight',    type: 'text' },
    { id: 'excludedUsers',    type: 'text'  },
    { id: 'excludedPrefixes', type: 'text'  },
    { id: 'showReplies',      type: 'check' },
    { id: 'meStyle',          type: 'text'  },
    { id: 'fontUrl',       type: 'text' },
    // Events — toggles
    { id: 'showResubs',     type: 'check' },
    { id: 'showGifts',      type: 'check' },
    { id: 'showBits',       type: 'check' },
    { id: 'showRedeems',    type: 'check' },
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
    // Badges & Cosmetics
    { id: 'disableAllBadges',     type: 'check' },
    { id: 'roleOnlyBadges',       type: 'check' },
    { id: 'showExternalCosmetics',type: 'check' },
    { id: 'toastEmotes',          type: 'check' },
];

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