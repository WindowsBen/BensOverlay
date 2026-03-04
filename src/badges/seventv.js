// ─── badges/seventv.js ────────────────────────────────────────────────────────
// Fetches per-user 7TV cosmetics (badge + paint) lazily on first message.
// Uses an LRU cache capped at MAX_CACHE_SIZE to avoid memory bloat in large chats.
// Only subscribes to live updates for cached users; unsubscribes on eviction.

const MAX_CACHE_SIZE = 200;

// LRU cache: twitchUserId → cosmetics object
// We maintain insertion order via a Map so oldest entries are easy to evict.
const sevenTVCosmeticsCache = new Map();

// twitchUserId → sevenTVUserId (for unsubscribing on eviction)
const sevenTVUserIdMap = {};

// Evict the oldest entry if we're over the cap
function _evictIfNeeded() {
    if (sevenTVCosmeticsCache.size <= MAX_CACHE_SIZE) return;
    const oldestKey = sevenTVCosmeticsCache.keys().next().value;
    const evicted   = sevenTVCosmeticsCache.get(oldestKey);
    sevenTVCosmeticsCache.delete(oldestKey);

    // Unsubscribe from live updates for this user
    const sevenTVId = evicted?.sevenTVUserId || Object.keys(sevenTVUserIdMap).find(k => sevenTVUserIdMap[k] === oldestKey);
    if (sevenTVId) {
        unsubscribe7TV('user.update', sevenTVId);
        delete sevenTVUserIdMap[sevenTVId];
    }
}

// Promote a cache entry to "most recently used" (move to end of Map)
function _touch(twitchUserId) {
    if (!sevenTVCosmeticsCache.has(twitchUserId)) return;
    const val = sevenTVCosmeticsCache.get(twitchUserId);
    sevenTVCosmeticsCache.delete(twitchUserId);
    sevenTVCosmeticsCache.set(twitchUserId, val);
}

async function fetch7TVUserCosmetics(twitchUserId) {
    if (sevenTVCosmeticsCache.has(twitchUserId)) {
        _touch(twitchUserId); // bump to MRU
        return sevenTVCosmeticsCache.get(twitchUserId);
    }

    // Mark pending to prevent duplicate fetches from concurrent messages
    sevenTVCosmeticsCache.set(twitchUserId, null);

    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!res.ok) return null;

        const data          = await res.json();
        const style         = data?.user?.style;
        const sevenTVUserId = data?.user?.id;
        const cosmetics     = { badgeUrl: null, paint: null, sevenTVUserId };

        if (style?.badge_id) {
            cosmetics.badgeUrl = `https://cdn.7tv.app/badge/${style.badge_id}/4x.webp`;
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

        sevenTVCosmeticsCache.set(twitchUserId, cosmetics);
        _evictIfNeeded();

        // Subscribe to live updates only for this cached user
        if (sevenTVUserId) {
            sevenTVUserIdMap[sevenTVUserId] = twitchUserId;
            subscribe7TV('user.update', sevenTVUserId, (body) => handle7TVUserUpdate(sevenTVUserId, body));
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

    // Wait 2s for 7TV's API to propagate the change
    await new Promise(resolve => setTimeout(resolve, 2000));

    sevenTVCosmeticsCache.delete(twitchUserId);

    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    document.querySelectorAll('[data-seventv-uid]').forEach(msgEl => {
        if (msgEl.dataset.seventvUid !== twitchUserId) return;
        reapply7TVCosmetics(msgEl, cosmetics);
    });
}

async function apply7TVCosmetics(twitchUserId, messageElement) {
    if (CONFIG.disableAllBadges || !CONFIG.showExternalCosmetics) return;

    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    messageElement.dataset.seventvUid = twitchUserId;
    reapply7TVCosmetics(messageElement, cosmetics);
}

function reapply7TVCosmetics(messageElement, cosmetics) {
    // ── Remove old badge ──
    messageElement.querySelectorAll('.seventv-badge').forEach(el => el.remove());

    // ── Remove old paint ──
    const usernameSpan = messageElement.querySelector('.username');
    if (usernameSpan) {
        [...usernameSpan.classList].forEach(cls => {
            if (cls.startsWith('seventv-paint-')) {
                usernameSpan.classList.remove(cls);
                document.querySelector(`style[data-paint="${cls}"]`)?.remove();
            }
        });
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
            img.width     = 18;
            img.height    = 18;
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