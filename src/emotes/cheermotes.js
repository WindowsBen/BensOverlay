// ─── emotes/cheermotes.js ─────────────────────────────────────────────────────
// Fetches Twitch cheermote definitions (global + channel-specific).
// Builds a prefix → sorted tiers map for use when rendering cheer messages.
// Each tier: { min_bits, url } where url is the animated dark image.

// prefix (lowercase) → [{ min_bits, url }, ...] sorted ascending by min_bits
const cheermoteMap = {};

async function fetchCheermotes(twitchUserId) {
    if (!CONFIG.token) return;

    try {
        // broadcaster_id param includes channel-specific cheermotes alongside globals
        const res = await fetch(
            `https://api.twitch.tv/helix/bits/cheermotes?broadcaster_id=${twitchUserId}`,
            { headers: { 'Authorization': `Bearer ${CONFIG.token}`, 'Client-Id': CONFIG.clientId } }
        );
        if (!res.ok) { console.warn('[Cheermotes] Failed to fetch:', res.status); return; }

        const data = await res.json();
        let count = 0;

        for (const action of data.data || []) {
            const prefix = action.prefix.toLowerCase();
            const tiers = [];

            for (const tier of action.tiers || []) {
                const url = tier.images?.dark?.animated?.['4'] || tier.images?.dark?.static?.['4'];
                if (url) {
                    tiers.push({ min_bits: tier.min_bits, url });
                }
            }

            if (tiers.length > 0) {
                // Sort ascending so we can walk from highest to lowest when matching
                tiers.sort((a, b) => a.min_bits - b.min_bits);
                cheermoteMap[prefix] = tiers;
                count++;
            }
        }

        console.log(`[Cheermotes] Loaded ${count} cheermote prefixes`);
    } catch (err) {
        console.error('[Cheermotes] Failed:', err);
    }
}

// Given a prefix and bit amount, return the correct tier image URL
function getCheermoteUrl(prefix, bits) {
    const tiers = cheermoteMap[prefix.toLowerCase()];
    if (!tiers) return null;

    // Find the highest tier whose min_bits <= bits
    let url = tiers[0].url;
    for (const tier of tiers) {
        if (bits >= tier.min_bits) url = tier.url;
        else break;
    }
    return url;
}

// Parse a cheer message and replace cheer tokens with <img> elements
// Returns HTML string
function renderCheerMessage(message) {
    // Cheer token format: one or more letters followed by digits e.g. "Cheer100", "BibleThump500"
    const tokenRegex = /\b([A-Za-z]+)(\d+)\b/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(message)) !== null) {
        const [full, prefix, bitsStr] = match;
        const bits = parseInt(bitsStr, 10);
        const url = getCheermoteUrl(prefix, bits);

        // Append text before this token
        result += escapeHTML(message.slice(lastIndex, match.index));

        if (url) {
            result += `<img class="chat-emote cheermote" src="${url}" alt="${escapeHTML(full)}" title="${escapeHTML(prefix)} ${bits}">`;
            result += `<span class="cheermote-amount">${bits}</span>`;
        } else {
            // Not a recognised cheermote — render as plain text
            result += escapeHTML(full);
        }

        lastIndex = match.index + full.length;
    }

    result += escapeHTML(message.slice(lastIndex));
    return result;
}