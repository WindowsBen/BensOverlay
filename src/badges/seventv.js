// ─── badges/seventv.js ────────────────────────────────────────────────────────
// Fetches per-user 7TV cosmetics (badge + paint) lazily on first message.
// Subscribes to live user updates so paint/badge changes apply in real time.
// Results are cached; cache is cleared on update to force a re-fetch.

// Cache: twitchUserId → { badgeUrl, paint, sevenTVUserId } | null
const sevenTVCosmeticsCache = {};

// Map sevenTVUserId → twitchUserId so the WS callback can find the right cache key
const sevenTVUserIdMap = {};

async function fetch7TVUserCosmetics(twitchUserId) {
    if (sevenTVCosmeticsCache[twitchUserId] !== undefined) {
        return sevenTVCosmeticsCache[twitchUserId];
    }

    // Mark as pending so concurrent messages don't trigger duplicate fetches
    sevenTVCosmeticsCache[twitchUserId] = null;

    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!res.ok) return null;

        const data        = await res.json();
        const style       = data?.user?.style;
        const sevenTVUserId = data?.user?.id;

        const cosmetics = { badgeUrl: null, paint: null, sevenTVUserId };

        if (style?.badge_id) {
            cosmetics.badgeUrl = `https://cdn.7tv.app/badge/${style.badge_id}/1x.webp`;
        }

        if (style?.paint_id) {
            const paintRes = await fetch('https://7tv.io/v3/gql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{
                    cosmetics(list: ["${style.paint_id}"]) {
                        paints { id name function color stops { at color } angle repeat image_url shadows { x_offset y_offset radius color } }
                    }
                }` })
            });
            if (paintRes.ok) {
                const paintData = await paintRes.json();
                cosmetics.paint = paintData?.data?.cosmetics?.paints?.[0] || null;
            }
        }

        sevenTVCosmeticsCache[twitchUserId] = cosmetics;

        // Subscribe to live updates for this user
        if (sevenTVUserId) {
            sevenTVUserIdMap[sevenTVUserId] = twitchUserId;
            subscribe7TV(`user.update`, sevenTVUserId, (body) => handle7TVUserUpdate(sevenTVUserId, body));
        }

        return cosmetics;

    } catch (err) {
        console.error(`[7TV Cosmetics] Failed for user ${twitchUserId}:`, err);
        return null;
    }
}

// Called when 7TV fires a user.update event for a subscribed user
async function handle7TVUserUpdate(sevenTVUserId, body) {
    const twitchUserId = sevenTVUserIdMap[sevenTVUserId];
    if (!twitchUserId) return;

    console.log(`[7TV Cosmetics] User update received for ${twitchUserId}, re-fetching...`);

    // Clear cache so next fetch is fresh
    delete sevenTVCosmeticsCache[twitchUserId];

    // Re-fetch new cosmetics
    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    // Find all existing messages from this user and re-apply cosmetics
    const messages = document.querySelectorAll(`[data-username]`);
    messages.forEach(msgEl => {
        // We only stored tmi login name, not twitchUserId on the element.
        // Instead, look for elements that already have a 7TV badge or paint from this user.
        // We tag message elements with data-seventv-uid when we first apply cosmetics.
        if (msgEl.dataset.seventvUid !== twitchUserId) return;
        reapply7TVCosmetics(msgEl, cosmetics);
    });
}

// Applies 7TV cosmetics to an already-rendered message element
async function apply7TVCosmetics(twitchUserId, messageElement) {
    if (!CONFIG.showExternalCosmetics) return;

    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    // Tag the element so we can find it on live updates
    messageElement.dataset.seventvUid = twitchUserId;

    reapply7TVCosmetics(messageElement, cosmetics);
}

// Removes old 7TV cosmetics from a message element and applies new ones
function reapply7TVCosmetics(messageElement, cosmetics) {
    // ── Remove old badge ──
    messageElement.querySelectorAll('.seventv-badge').forEach(el => el.remove());

    // ── Remove old paint ──
    const usernameSpan = messageElement.querySelector('.username');
    if (usernameSpan) {
        // Remove any seventv-paint-* classes and associated <style> tags
        [...usernameSpan.classList].forEach(cls => {
            if (cls.startsWith('seventv-paint-')) {
                usernameSpan.classList.remove(cls);
                document.querySelector(`style[data-paint="${cls}"]`)?.remove();
            }
        });
        // Restore inherited text shadow and color
        usernameSpan.style.textShadow = '';
        usernameSpan.style.display    = '';
    }

    // ── Apply new badge ──
    if (cosmetics.badgeUrl) {
        const badgesSpan = messageElement.querySelector('.badges');
        if (badgesSpan) {
            const img     = document.createElement('img');
            img.className = 'chat-badge seventv-badge';
            img.src       = cosmetics.badgeUrl;
            img.alt       = '7TV';
            img.title     = '7TV';
            badgesSpan.appendChild(img);
        }
    }

    // ── Apply new paint ──
    if (cosmetics.paint && usernameSpan) {
        applyPaint(usernameSpan, cosmetics.paint);
    }
}