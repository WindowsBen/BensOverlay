// ─── seventv-ws.js ────────────────────────────────────────────────────────────
// Single shared WebSocket connection to the 7TV EventSub.
// Both emote set updates and user cosmetic updates subscribe through this.
//
// Handlers are keyed by "type:objectId" so multiple users can each have their
// own user.update subscription without overwriting each other.

const _7tvHandlers = {}; // "type:objectId" → callback(body)
const _7tvSubs     = []; // list of { type, objectId } for reconnect

let _7tvWS      = null;
let _7tvReady   = false;
const _7tvQueue = []; // subscriptions queued before WS was open

function get7TVWS() {
    if (_7tvWS) return _7tvWS;

    _7tvWS = new WebSocket('wss://events.7tv.io/v3');

    _7tvWS.onopen = () => {
        _7tvReady = true;
        console.log('[7TV WS] Connected');
        for (const sub of _7tvQueue) {
            _7tvWS.send(JSON.stringify(sub));
        }
        _7tvQueue.length = 0;
    };

    _7tvWS.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.op !== 0) return; // op 0 = Dispatch

        const type     = msg.d?.type;
        const body     = msg.d?.body;
        const objectId = body?.id || body?.object?.id;

        // Route to the specific handler for this type+object
        const key = `${type}:${objectId}`;
        if (_7tvHandlers[key]) {
            _7tvHandlers[key](body);
            return;
        }
        // Fallback: handler registered without a specific objectId (e.g. emote set)
        if (_7tvHandlers[type]) {
            _7tvHandlers[type](body);
        }
    };

    _7tvWS.onclose = () => {
        console.warn('[7TV WS] Closed — reconnecting in 5s...');
        _7tvWS    = null;
        _7tvReady = false;
        setTimeout(() => {
            get7TVWS();
            // Re-subscribe everything after reconnect
            _7tvSubs.forEach(({ type, objectId }) => _sendSub(type, objectId));
        }, 5000);
    };

    _7tvWS.onerror = (err) => console.error('[7TV WS] Error:', err);

    return _7tvWS;
}

function _sendSub(type, objectId) {
    const payload = { op: 35, d: { type, condition: { object_id: objectId } } };
    if (_7tvReady && _7tvWS?.readyState === WebSocket.OPEN) {
        _7tvWS.send(JSON.stringify(payload));
    } else {
        _7tvQueue.push(payload);
        get7TVWS();
    }
}

function subscribe7TV(type, objectId, handler) {
    const key = objectId ? `${type}:${objectId}` : type;
    _7tvHandlers[key] = handler;

    if (!_7tvSubs.find(s => s.type === type && s.objectId === objectId)) {
        _7tvSubs.push({ type, objectId });
    }

    _sendSub(type, objectId);
    console.log(`[7TV WS] Subscribed to ${type} for ${objectId}`);
}

function unsubscribe7TV(type, objectId) {
    const key = objectId ? `${type}:${objectId}` : type;
    delete _7tvHandlers[key];

    const idx = _7tvSubs.findIndex(s => s.type === type && s.objectId === objectId);
    if (idx !== -1) _7tvSubs.splice(idx, 1);

    // Send unsubscribe (op 36) to the server
    const payload = { op: 36, d: { type, condition: { object_id: objectId } } };
    if (_7tvReady && _7tvWS?.readyState === WebSocket.OPEN) {
        _7tvWS.send(JSON.stringify(payload));
    }
    console.log(`[7TV WS] Unsubscribed from ${type} for ${objectId}`);
}