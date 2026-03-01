// ─── emotes/emoteMap.js ───────────────────────────────────────────────────────
// Single shared emote registry. All providers (BTTV, FFZ, 7TV) write into this.
// Load order: FFZ → BTTV → 7TV, so 7TV wins any name conflicts.

const emoteMap = {};

// 7TV emotes flagged as zero-width (overlay on preceding emote)
const zeroWidthEmotes = new Set();

// FFZ emotes flagged as modifier (also overlay on preceding emote)
const ffzModifierEmotes = new Set();

// BTTV modifier keywords that come BEFORE the target emote
const BTTV_MODIFIERS = {
    'w!': 'emote-mod-wide',
    'h!': 'emote-mod-flip-h',
    'v!': 'emote-mod-flip-v',
    'z!': 'emote-mod-zero-space',
};