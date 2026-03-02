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
    const fontUrl     = v('fontUrl').trim();

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

    const url = `${base}overlay.html#channel=${encodeURIComponent(channel)}&fontSize=${v('fontSize')}px&shadow=${c8('shadowColor','shadowOpacity')}${fontParams ? '&'+fontParams : ''}&toastEmotes=${ch('toastEmotes') ? '1':'0'}&${eventParams}${badgeParams}&token=${encodeURIComponent(token)}`;

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