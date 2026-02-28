// ─── badges/seventv.js ────────────────────────────────────────────────────────
// Fetches per-user 7TV cosmetics (badge + paint) lazily on first message.
// Results are cached so each user is only fetched once per session.

// Cache: twitchUserId → { badgeUrl: string|null, paint: object|null }
const sevenTVCosmeticsCache = {};

async function fetch7TVUserCosmetics(twitchUserId) {
    if (sevenTVCosmeticsCache[twitchUserId] !== undefined) {
        return sevenTVCosmeticsCache[twitchUserId];
    }

    // Mark as pending so concurrent messages don't trigger duplicate fetches
    sevenTVCosmeticsCache[twitchUserId] = null;

    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!res.ok) return null;

        const data = await res.json();
        const style = data?.user?.style;

        const cosmetics = {
            badgeUrl: null,
            paint:    null,
        };

        if (style?.badge_id) {
            cosmetics.badgeUrl = `https://cdn.7tv.app/badge/${style.badge_id}/1x.webp`;
        }

        if (style?.paint_id) {
            // Fetch the paint definition
            const paintRes = await fetch(`https://7tv.io/v3/cosmetics/paints/${style.paint_id}`);
            if (paintRes.ok) {
                cosmetics.paint = await paintRes.json();
                console.log('[7TV Paint] Raw paint data:', JSON.stringify(cosmetics.paint));
            } else {
                console.warn('[7TV Paint] Fetch failed:', paintRes.status, await paintRes.text());
            }
        }

        sevenTVCosmeticsCache[twitchUserId] = cosmetics;
        return cosmetics;

    } catch (err) {
        console.error(`[7TV Cosmetics] Failed for user ${twitchUserId}:`, err);
        return null;
    }
}

// Applies 7TV cosmetics to an already-rendered message element.
// Called async after displayMessage — badge/paint appear shortly after render.
async function apply7TVCosmetics(twitchUserId, messageElement) {
    if (!CONFIG.showExternalCosmetics) return;

    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    // ── Badge ──
    if (cosmetics.badgeUrl) {
        const badgesSpan = messageElement.querySelector('.badges');
        if (badgesSpan) {
            const img = document.createElement('img');
            img.className = 'chat-badge seventv-badge';
            img.src       = cosmetics.badgeUrl;
            img.alt       = '7TV';
            img.title     = '7TV';
            badgesSpan.appendChild(img);
        }
    }

    // ── Paint ──
    if (cosmetics.paint) {
        const usernameSpan = messageElement.querySelector('.username');
        if (usernameSpan) {
            applyPaint(usernameSpan, cosmetics.paint);
        }
    }
}