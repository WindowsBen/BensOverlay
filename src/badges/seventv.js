// ─── badges/seventv.js ────────────────────────────────────────────────────────
// Per-user 7TV cosmetics: custom badge and username paint.
//
// Cosmetics are fetched lazily on first message from a user and cached.
// To handle large channels without memory bloat, the cache is an LRU (Least
// Recently Used) Map capped at MAX_CACHE_SIZE. When a user is evicted, their
// live update subscription is also cancelled to keep server-side sub count low.
//
// Live updates: 7TV fires a user.update event when someone changes their
// cosmetics mid-stream. We re-fetch their data and update all their visible
// messages in the DOM.

const MAX_CACHE_SIZE = 200; // covers all active chatters with headroom

// LRU cache: twitchUserId → cosmetics { badgeUrl, paint, sevenTVUserId }
// Map preserves insertion order — oldest entries are at the front.
const sevenTVCosmeticsCache = new Map();

// sevenTVUserId → twitchUserId reverse map, needed to unsubscribe on eviction
const sevenTVUserIdMap = {};

// Evict the least-recently-used entry when the cache exceeds its cap.
// Also sends an unsubscribe to the 7TV WebSocket for the evicted user.
function _evictIfNeeded() {
    if (sevenTVCosmeticsCache.size <= MAX_CACHE_SIZE) return;
    const oldestKey = sevenTVCosmeticsCache.keys().next().value; // first key = oldest
    const evicted   = sevenTVCosmeticsCache.get(oldestKey);
    sevenTVCosmeticsCache.delete(oldestKey);

    const sevenTVId = evicted?.sevenTVUserId;
    if (sevenTVId) {
        unsubscribe7TV('user.update', sevenTVId);
        delete sevenTVUserIdMap[sevenTVId];
    }
}

// Promote a cached entry to MRU by removing and re-inserting at the end of the Map.
// Called on every cache hit so frequently chatting users are never evicted.
function _touch(twitchUserId) {
    if (!sevenTVCosmeticsCache.has(twitchUserId)) return;
    const val = sevenTVCosmeticsCache.get(twitchUserId);
    sevenTVCosmeticsCache.delete(twitchUserId);
    sevenTVCosmeticsCache.set(twitchUserId, val);
}

// Fetches cosmetics for a Twitch user ID, using the cache where possible.
// Sets a null sentinel immediately to prevent duplicate in-flight fetches.
async function fetch7TVUserCosmetics(twitchUserId) {
    if (sevenTVCosmeticsCache.has(twitchUserId)) {
        _touch(twitchUserId);
        return sevenTVCosmeticsCache.get(twitchUserId);
    }

    // Sentinel: subsequent messages for the same user won't trigger another fetch
    sevenTVCosmeticsCache.set(twitchUserId, null);

    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        if (!res.ok) return null;

        const data          = await res.json();
        const style         = data?.user?.style;
        const sevenTVUserId = data?.user?.id;
        const cosmetics     = { badgeUrl: null, paint: null, sevenTVUserId };

        console.log(`[7TV Debug] users/twitch/${twitchUserId} → style:`, style, ' sevenTVUserId:', sevenTVUserId);

        // Badge — just a CDN URL keyed by badge_id
        if (style?.badge_id) {
            cosmetics.badgeUrl = `https://cdn.7tv.app/badge/${style.badge_id}/4x.webp`;
        }

        // Paint — requires a second GQL call to fetch the full paint definition
        if (style?.paint_id) {
            const paintRes = await fetch('https://7tv.io/v3/gql', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `{
                    cosmetics(list: ["${style.paint_id}"]) {
                        paints {
                            id name color
                            gradients { function canvas_repeat canvas_size at stops { at color center_at } image_url shape angle repeat }
                            function repeat angle shape image_url
                            stops { at color }
                            shadows { x_offset y_offset radius color }
                        }
                    }
                }` })
            });
            if (paintRes.ok) {
                const paintData = await paintRes.json();
                console.log(`[7TV Debug] GQL paint response for paint_id=${style.paint_id}:`, JSON.stringify(paintData, null, 2));
                if (paintData?.errors) {
                    console.warn('[7TV Debug] GQL response contains errors (HTTP 200 does not mean success for GraphQL):', paintData.errors);
                }
                cosmetics.paint = paintData?.data?.cosmetics?.paints?.[0] || null;
                console.log('[7TV Debug] Resolved cosmetics.paint:', cosmetics.paint);
            } else {
                console.warn(`[7TV Debug] GQL request itself failed — HTTP ${paintRes.status}`);
            }
        }

        sevenTVCosmeticsCache.set(twitchUserId, cosmetics);
        _evictIfNeeded();

        // Subscribe to live cosmetic changes for this user
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

// Called by the 7TV WebSocket when a subscribed user updates their cosmetics.
// Waits 2s for the API to propagate the change, then re-fetches and repaints
// all of that user's currently visible messages.
async function handle7TVUserUpdate(sevenTVUserId, body) {
    const twitchUserId = sevenTVUserIdMap[sevenTVUserId];
    if (!twitchUserId) return;

    // Brief delay so the 7TV REST API reflects the change before we re-fetch
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Bust the cache entry so fetch7TVUserCosmetics pulls fresh data
    sevenTVCosmeticsCache.delete(twitchUserId);

    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    // Update all visible message elements belonging to this user
    document.querySelectorAll('[data-seventv-uid]').forEach(msgEl => {
        if (msgEl.dataset.seventvUid !== twitchUserId) return;
        reapply7TVCosmetics(msgEl, cosmetics);
    });
}

// Entry point called by renderer.js after a message is added to the DOM.
// Tags the element with the user's Twitch ID so handle7TVUserUpdate can find it.
async function apply7TVCosmetics(twitchUserId, messageElement) {
    if (!CONFIG.showBadge7TV && !CONFIG.show7TVPaints) return;

    const cosmetics = await fetch7TVUserCosmetics(twitchUserId);
    if (!cosmetics) return;

    messageElement.dataset.seventvUid = twitchUserId;
    reapply7TVCosmetics(messageElement, cosmetics);
}

// Removes stale cosmetics and applies fresh ones to a single message element.
// Handles both badge (img tag in .badges) and paint (CSS class on .username).
// Also paints .message-text for colored /me messages (data-me-colored="1").
function reapply7TVCosmetics(messageElement, cosmetics) {
    // Remove any previously injected 7TV badge image
    messageElement.querySelectorAll('.seventv-badge').forEach(el => el.remove());

    // Remove old paint classes and their associated <style> tags from both
    // the username span and the message-text span (the latter for /me messages)
    const usernameSpan = messageElement.querySelector('.username');
    const msgTextSpan  = messageElement.querySelector('.message-text');
    [usernameSpan, msgTextSpan].forEach(span => {
        if (!span) return;
        [...span.classList].forEach(cls => {
            if (cls.startsWith('seventv-paint-')) {
                span.classList.remove(cls);
                document.querySelector(`style[data-paint="${cls}"]`)?.remove();
            }
        });
        span.style.textShadow = '';
        span.style.display    = '';
    });

    // Inject the new badge into the .badges span
    if (cosmetics.badgeUrl && CONFIG.showBadge7TV) {
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

    // Apply paint to the username span, and also to message-text for /me colored actions
    console.log('[7TV Debug] reapply7TVCosmetics paint check — paint:', cosmetics.paint, ' usernameSpan found:', !!usernameSpan, ' show7TVPaints:', CONFIG.show7TVPaints);
    if (cosmetics.paint && usernameSpan && CONFIG.show7TVPaints) {
        applyPaint(usernameSpan, cosmetics.paint);
        if (messageElement.dataset.meColored) {
            const msgText = messageElement.querySelector('.message-text');
            if (msgText) applyPaint(msgText, cosmetics.paint);
        }
    }
}