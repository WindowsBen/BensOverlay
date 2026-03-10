// ─── ui/bubbles.js ─────────────────────────────────────────────────────────────
// "Bubbles" chat style — every chat message spawns as a floating soap bubble
// that drifts gently before popping. Special variants for events and hype train.
//
// Visual technique from Uiverse.io (by Dennyhml):
//   5 absolutely-positioned border-spans with blur create iridescent refraction.
//   Two white blobs via ::before/::after act as specular highlights.
//   The shell itself is transparent — the sphere illusion is pure CSS.
//
// Integration points (all guarded by CONFIG.chatStyle === 'bubbles'):
//   • displayMessage()        in renderer.js   → displayBubbleMessage()
//   • displayEventMessage()   in events.js     → displayBubbleEvent()
//   • handlePubSubHypeTrain() in hype-train.js → bubbleHypeTrainShow/Update/End()

// ── Inject CSS once ────────────────────────────────────────────────────────────
// CSS is built as an array-join rather than a template-literal so that the
// backtick characters inside JS template strings below never conflict with
// the CSS string boundary.
(function _injectBubbleCSS() {
    const s = document.createElement('style');
    s.id = 'bubble-styles';
    s.textContent = [

        // ── Overlay container ────────────────────────────────────────────────
        '#bubble-overlay{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:10;}',

        // ── Soap bubble shell ─────────────────────────────────────────────────
        // Real soap bubble: near-transparent body, very thin iridescent membrane,
        // a bright crescent specular at top-left, faint caustic glow at bottom.
        '.soap-bubble{',
        '    position:absolute;',
        '    min-width:180px; max-width:320px;',
        '    border-radius:999px;',
        '    padding:14px 26px;',

        // Almost fully transparent fill — soap film is just a thin layer
        '    background: radial-gradient(ellipse at 38% 32%,',
        '        rgba(255,255,255,0.13) 0%,',
        '        rgba(180,225,255,0.05) 40%,',
        '        rgba(80,140,210,0.07) 100%);',

        // Thin glowing border — color cycles via keyframe animation below
        '    border:1.5px solid rgba(160,210,255,0.55);',

        // Outer soft glow + inner light
        '    box-shadow:',
        '        0 0 10px rgba(140,200,255,0.18),',
        '        inset 0 2px 8px rgba(255,255,255,0.18),',
        '        inset 0 -4px 10px rgba(80,140,220,0.12);',

        '    color:rgba(255,255,255,0.95);',
        '    font-size:var(--message-font-size,15px);',
        '    font-family:var(--chat-font-family,sans-serif);',
        '    line-height:1.4; word-break:break-word;',
        '    pointer-events:none;',
        '    isolation:isolate; overflow:hidden;',

        // Start invisible + collapsed; bubble-inflate animation plays on spawn
        '    opacity:0; transform:scale(0);',
        '}',

        // ── Iridescent membrane shimmer ───────────────────────────────────────
        // Cycles border-color + shadow hue around the visible spectrum
        '@keyframes bubble-iridescence{',
        '  0%  {border-color:rgba(160,220,255,0.55);box-shadow:0 0 10px rgba(140,200,255,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(80,140,220,0.12);}',
        '  16% {border-color:rgba(200,160,255,0.55);box-shadow:0 0 10px rgba(180,140,255,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(140,80,220,0.12);}',
        '  33% {border-color:rgba(160,255,200,0.55);box-shadow:0 0 10px rgba(140,255,180,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(80,220,140,0.12);}',
        '  50% {border-color:rgba(255,220,140,0.55);box-shadow:0 0 10px rgba(255,200,120,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(220,140,60,0.12);}',
        '  66% {border-color:rgba(255,160,180,0.55);box-shadow:0 0 10px rgba(255,140,160,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(220,80,100,0.12);}',
        '  83% {border-color:rgba(160,200,255,0.55);box-shadow:0 0 10px rgba(140,180,255,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(80,120,220,0.12);}',
        ' 100% {border-color:rgba(160,220,255,0.55);box-shadow:0 0 10px rgba(140,200,255,0.18),inset 0 2px 8px rgba(255,255,255,0.18),inset 0 -4px 10px rgba(80,140,220,0.12);}',
        '}',

        // ── Blow-up (inflate) animation ───────────────────────────────────────
        // Mimics the elastic wobble of a real bubble being blown:
        // rapid expansion → slight overshoot → micro-bounces → settle
        '@keyframes bubble-inflate{',
        '  0%   {transform:scale(0);    opacity:0;}',
        '  55%  {transform:scale(1.12); opacity:1;}',
        '  70%  {transform:scale(0.96);}',
        '  82%  {transform:scale(1.05);}',
        '  91%  {transform:scale(0.99);}',
        '  100% {transform:scale(1);    opacity:1;}',
        '}',

        // Class added by JS to trigger inflate + iridescence together
        '.soap-bubble.bubble-visible{',
        '    animation:',
        '        bubble-inflate     0.65s cubic-bezier(0.22,1,0.36,1) forwards,',
        '        bubble-iridescence 5s   linear 0.65s infinite;',
        '}',

        // ── Crescent specular highlight ───────────────────────────────────────
        // Main reflection arc — bright white crescent at top-left,
        // like sunlight catching the near side of a real bubble
        '.soap-bubble::before{',
        '    content:""; position:absolute;',
        '    top:10%; left:8%;',
        '    width:44%; height:28%;',
        '    border-radius:50%;',
        '    border-top:2px solid rgba(255,255,255,0.75);',
        '    border-left:1px solid rgba(255,255,255,0.3);',
        '    background:transparent;',
        '    transform:rotate(-28deg);',
        '    z-index:6; pointer-events:none;',
        '}',
        // Tiny secondary sparkle below the main arc
        '.soap-bubble::after{',
        '    content:""; position:absolute;',
        '    top:22%; left:18%;',
        '    width:12%; height:8%;',
        '    border-radius:50%;',
        '    background:rgba(255,255,255,0.45);',
        '    z-index:6; pointer-events:none;',
        '}',

        // ── Content floats above decorative layers ────────────────────────────
        '.bubble-content{position:relative;z-index:5;}',

        // ── Pop animation ─────────────────────────────────────────────────────
        // Real bubble pops: a pinhole tears open, membrane retracts outward
        // in ~50ms with a bright flash, leaving only water droplets.
        // We simulate with a quick bright flash + rapid scale-out + fade.
        '@keyframes bubble-pop{',
        '  0%   {transform:scale(1);   opacity:1; filter:brightness(1);}',
        '  18%  {transform:scale(1.08);opacity:1; filter:brightness(2.8);}',
        '  100% {transform:scale(1.4); opacity:0; filter:brightness(1);}',
        '}',
        '.bubble-popping{animation:bubble-pop 0.28s ease-out forwards !important;}',

        // ── Pop particles (water droplets) ────────────────────────────────────
        '.bubble-particle,.bubble-sparkle{',
        '    position:absolute;border-radius:50%;opacity:1;pointer-events:none;',
        '    animation:bubble-particle-fly var(--fly-dur,0.5s) ease-out forwards;',
        '}',
        '@keyframes bubble-particle-fly{',
        '  0%  {translate:0 0;opacity:1;scale:1;}',
        '  100%{translate:var(--fx) var(--fy);opacity:0;scale:0.2;}',
        '}',

        // ── Event bubble (subs / bits) ────────────────────────────────────────
        // Bigger, more prominent — sits center-screen with pulsing outer glow
        '.soap-bubble-event{',
        '    min-width:240px; max-width:380px;',
        '    padding:22px 30px; border-radius:999px;',
        '    box-shadow:',
        '        0 0 20px rgba(160,100,255,0.3),',
        '        0 0 40px rgba(160,100,255,0.12),',
        '        inset 0 2px 10px rgba(255,255,255,0.2),',
        '        inset 0 -6px 14px rgba(100,60,200,0.15);',
        '}',
        '@keyframes event-bubble-glow{',
        '  0%,100%{box-shadow:0 0 20px rgba(160,100,255,0.3),0 0 40px rgba(160,100,255,0.12),inset 0 2px 10px rgba(255,255,255,0.2),inset 0 -6px 14px rgba(100,60,200,0.15);}',
        '  50%    {box-shadow:0 0 35px rgba(160,100,255,0.55),0 0 70px rgba(160,100,255,0.25),inset 0 2px 10px rgba(255,255,255,0.2),inset 0 -6px 14px rgba(100,60,200,0.15);}',
        '}',
        '.soap-bubble-event.bubble-visible{',
        '    animation:',
        '        bubble-inflate     0.65s cubic-bezier(0.22,1,0.36,1) forwards,',
        '        bubble-iridescence 5s   linear 0.65s infinite,',
        '        event-bubble-glow  2s   ease-in-out 0.65s infinite;',
        '}',

        // ── Inner text labels ─────────────────────────────────────────────────
        '.bubble-username{font-weight:700;font-size:var(--name-font-size,15px);display:inline;}',
        '.bubble-message {display:inline;color:rgba(255,255,255,0.9);}',
        '.bubble-event-icon  {display:block;font-size:22px;text-align:center;margin-bottom:5px;}',
        '.bubble-event-label {display:block;font-weight:800;font-size:14px;letter-spacing:0.5px;text-align:center;margin-bottom:2px;}',
        '.bubble-event-detail{display:block;font-size:11px;text-align:center;color:rgba(255,255,255,0.6);font-style:italic;}',

        // ── Hype train edge bubbles ───────────────────────────────────────────
        '.ht-bubble{',
        '    position:absolute; width:80px; height:80px; border-radius:50%;',
        '    background:radial-gradient(ellipse at 38% 32%,rgba(255,255,255,0.13) 0%,rgba(255,180,80,0.06) 50%,rgba(200,80,20,0.08) 100%);',
        '    border:1.5px solid rgba(255,160,80,0.55);',
        '    box-shadow:0 0 10px rgba(255,140,60,0.2),inset 0 2px 8px rgba(255,255,255,0.15),inset 0 -4px 10px rgba(200,80,20,0.1);',
        '    overflow:hidden; isolation:isolate;',
        '    display:flex;flex-direction:column;align-items:center;justify-content:center;',
        '    pointer-events:none; opacity:0; transform:scale(0);',
        '    transition:opacity 0.4s ease,transform 0.4s cubic-bezier(0.34,1.56,0.64,1);',
        '}',
        '.ht-bubble::before{',
        '    content:""; position:absolute;',
        '    top:10%; left:8%; width:42%; height:26%;',
        '    border-radius:50%;',
        '    border-top:2px solid rgba(255,255,255,0.7);',
        '    border-left:1px solid rgba(255,255,255,0.25);',
        '    background:transparent;',
        '    transform:rotate(-28deg); z-index:6; pointer-events:none;',
        '}',
        '.ht-bubble::after{',
        '    content:""; position:absolute;',
        '    top:22%; left:18%; width:14%; height:9%;',
        '    border-radius:50%;',
        '    background:rgba(255,255,255,0.4);',
        '    z-index:6; pointer-events:none;',
        '}',
        '.ht-bubble.ht-bubble-visible{',
        '    opacity:1; transform:scale(1);',
        '    animation:ht-iridescence 4s linear infinite;',
        '}',
        '@keyframes ht-iridescence{',
        '  0%  {border-color:rgba(255,160,80,0.55);}',
        '  33% {border-color:rgba(255,80,160,0.55);}',
        '  66% {border-color:rgba(255,220,80,0.55);}',
        ' 100% {border-color:rgba(255,160,80,0.55);}',
        '}',
        '.ht-bubble-icon {position:relative;z-index:5;font-size:22px;line-height:1;}',
        '.ht-bubble-level{position:relative;z-index:5;font-size:9px;font-weight:800;color:rgba(255,220,120,0.95);letter-spacing:0.5px;margin-top:2px;}',

        '@keyframes ht-bubble-bob-a{0%,100%{translate:0 -8px;}50%{translate: 6px 8px;}}',
        '@keyframes ht-bubble-bob-b{0%,100%{translate:0 -8px;}50%{translate:-8px 8px;}}',
        '@keyframes ht-bubble-bob-c{0%,100%{translate:0 -8px;}50%{translate:10px 6px;}}',
        '.ht-bubble-bob-a{animation:ht-iridescence 4s linear infinite,ht-bubble-bob-a var(--bob-dur,3s) ease-in-out infinite;}',
        '.ht-bubble-bob-b{animation:ht-iridescence 4s linear infinite,ht-bubble-bob-b var(--bob-dur,3s) ease-in-out infinite;}',
        '.ht-bubble-bob-c{animation:ht-iridescence 4s linear infinite,ht-bubble-bob-c var(--bob-dur,3s) ease-in-out infinite;}',

        '@keyframes ht-bubble-flyoff{0%{opacity:1;}100%{opacity:0;translate:var(--flyoff-x,0px) var(--flyoff-y,-300px);}}',
        '.ht-bubble-flying{animation:ht-bubble-flyoff 1.2s ease-in forwards !important;}',

    ].join('\n');
    document.head.appendChild(s);
})();

// ── Utilities ──────────────────────────────────────────────────────────────────
const _BOB_CLASSES    = ['ht-bubble-bob-a','ht-bubble-bob-b','ht-bubble-bob-c'];
const _SPARKLE_COLORS = [
    '#ffffff','#ffe0ff','#e0f0ff','#ffd0a0',
    '#c0e0ff','#ffb0e0','#b0ffe0','#fff0a0',
];

function _rand(min, max)  { return min + Math.random() * (max - min); }
function _pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }
function _bubbleOverlay() { return document.getElementById('bubble-overlay'); }

// ── Per-bubble smooth drift ────────────────────────────────────────────────────
// Uses two independent looping sine-wave animations (X and Y at co-prime periods)
// so the path is a continuous Lissajous-like figure — never stops, never repeats.
// bubbleMotion (1–10) scales both amplitude and speed.
let _driftCounter = 0;
function _startBubbleDrift(el, motionScale) {
    const id = 'bd-' + (++_driftCounter);

    // Amplitude: 20–120px horizontal, 15–80px vertical, scaled by motionScale (1–10)
    const ax  = Math.round(_rand(20, 60)  * motionScale / 5);   // x amplitude
    const ay  = Math.round(_rand(15, 40)  * motionScale / 5);   // y amplitude

    // Co-prime periods ensure the path never closes/repeats visibly
    const tx  = (_rand(4, 8)  * (11 - motionScale) / 5).toFixed(1);  // x period (s)
    const ty  = (_rand(5, 11) * (11 - motionScale) / 5).toFixed(1);  // y period (s)

    // Random phase offsets so bubbles don't all start moving in the same direction
    const px  = _rand(0, 360).toFixed(0);
    const py  = _rand(0, 360).toFixed(0);

    // Gentle upward drift: translate the anchor point upward over the lifetime
    const driftUp  = Math.round(_rand(60, 140) * motionScale / 5);
    const lifetime = (CONFIG.messageLifetime > 0 ? CONFIG.messageLifetime : 8000) / 1000;

    const keyframeCSS =
        '@keyframes ' + id + '-x{' +
            '0%  {--bx:' + Math.round(Math.sin(px * Math.PI/180) * ax) + 'px}' +
            '25% {--bx:' + ax  + 'px}' +
            '50% {--bx:-'+ ax  + 'px}' +
            '75% {--bx:' + ax  + 'px}' +
            '100%{--bx:' + Math.round(Math.sin(px * Math.PI/180) * ax) + 'px}' +
        '}' +
        '@keyframes ' + id + '-y{' +
            '0%  {--by:' + Math.round(Math.sin(py * Math.PI/180) * ay) + 'px}' +
            '25% {--by:' + ay  + 'px}' +
            '50% {--by:-'+ ay  + 'px}' +
            '75% {--by:' + ay  + 'px}' +
            '100%{--by:' + Math.round(Math.sin(py * Math.PI/180) * ay) + 'px}' +
        '}' +
        '@keyframes ' + id + '-up{' +
            '0%  {--bu:0px}' +
            '100%{--bu:-' + driftUp + 'px}' +
        '}' +
        // Composite: the element reads all three custom properties via transform
        '.' + id + '{' +
            'translate:var(--bx,0px) calc(var(--by,0px) + var(--bu,0px));' +
            'animation:' +
                'bubble-iridescence 5s linear infinite,' +
                id + '-x ' + tx + 's ease-in-out infinite,' +
                id + '-y ' + ty + 's ease-in-out infinite,' +
                id + '-up ' + lifetime + 's linear forwards;' +
        '}';

    const style = document.createElement('style');
    style.dataset.bubbleDrift = id;
    style.textContent = keyframeCSS;
    document.head.appendChild(style);

    // Lock the inflated state before touching the animation property,
    // otherwise the forwards fill from bubble-inflate disappears and
    // the base CSS opacity:0/scale(0) snaps back for one frame.
    el.style.opacity   = '1';
    el.style.transform = 'scale(1)';

    // One rAF so the browser parses the new @keyframes block before we
    // reference it — without this the animation name is unknown and nothing moves.
    requestAnimationFrame(function () {
        el.classList.add(id);
        el._driftStyleId  = id;
        el._driftClass    = id;
    });
}

function _cleanupDriftStyle(el) {
    if (el._driftStyleId) {
        document.querySelector('style[data-bubble-drift="' + el._driftStyleId + '"]')?.remove();
        if (el._driftClass) el.classList.remove(el._driftClass);
        el._driftStyleId = null;
        el._driftClass   = null;
    }
}

// No span layers — visuals handled entirely by CSS border/box-shadow/::before/::after

// ── Pop effect ─────────────────────────────────────────────────────────────────
// Snapshots the bubble's current screen position, clears the drift animation
// (which would snap it back to origin), then fires the pop + particles.
function _popBubble(el, isEvent) {
    // 1. Snapshot where the bubble actually is right now
    const rect = el.getBoundingClientRect();

    // 2. Freeze it there — lock current position as inline styles, then clear
    //    the drift animation. Setting animation:'none' would let the base CSS
    //    opacity:0/scale(0) snap in for one frame before bubble-popping starts,
    //    so we set opacity/transform first, then force a reflow, then clear.
    el.style.opacity   = '1';
    el.style.transform = 'scale(1)';
    el.style.translate  = 'none';
    el.style.left       = rect.left + 'px';
    el.style.top        = rect.top  + 'px';
    _cleanupDriftStyle(el);   // removes drift class + @keyframes style tag
    el.style.animation  = 'none';

    // 3. Force a reflow so the position change takes effect before the pop
    void el.offsetWidth;

    // 4. Now fire the pop animation (safe — no drift to snap back from)
    el.classList.add('bubble-popping');

    const cx      = rect.left + rect.width  / 2;
    const cy      = rect.top  + rect.height / 2;
    const count   = isEvent ? 16 : 9;
    const spread  = isEvent ? 90 : 55;
    const dur     = isEvent ? 0.75 : 0.5;
    const overlay = _bubbleOverlay();

    for (let i = 0; i < count; i++) {
        const angle = (360 / count) * i + _rand(-15, 15);
        const dist  = _rand(spread * 0.5, spread);
        const fx    = Math.round(Math.cos(angle * Math.PI / 180) * dist);
        const fy    = Math.round(Math.sin(angle * Math.PI / 180) * dist);
        const size  = isEvent ? _rand(5, 10) : _rand(3, 6);

        const p = document.createElement('div');
        p.className        = isEvent ? 'bubble-sparkle' : 'bubble-particle';
        p.style.left       = (cx - size / 2) + 'px';
        p.style.top        = (cy - size / 2) + 'px';
        p.style.width      = size + 'px';
        p.style.height     = size + 'px';
        p.style.background = _pick(_SPARKLE_COLORS);
        p.style.setProperty('--fx',      fx + 'px');
        p.style.setProperty('--fy',      fy + 'px');
        p.style.setProperty('--fly-dur', (dur + _rand(0, 0.2)) + 's');
        overlay.appendChild(p);
        setTimeout(() => p.remove(), (dur + 0.3) * 1000);
    }

    setTimeout(() => el.remove(), 280);
}

// ── Chat bubble ────────────────────────────────────────────────────────────────
// Called from renderer.js when chatStyle === 'bubbles'.
function displayBubbleMessage(tags, parsedMessageHTML, isAction) {
    const overlay = _bubbleOverlay();
    if (!overlay) return;

    const username   = tags['display-name'] || tags.username || 'chatter';
    const userColor  = tags.color || '#b0d0ff';
    const badgesHTML = typeof renderBadges === 'function' ? renderBadges(tags) : '';

    let msgStyle = '';
    if (isAction && CONFIG.meStyle !== 'none') {
        if      (CONFIG.meStyle === 'colored') msgStyle = 'color:' + userColor;
        else if (CONFIG.meStyle === 'italic')  msgStyle = 'font-style:italic';
    }

    const el = document.createElement('div');
    el.className = 'soap-bubble';

    if (tags['id'])    el.dataset.msgId   = tags['id'];
    if (tags.username) el.dataset.username = tags.username.toLowerCase();

    el.innerHTML =
        '<div class="bubble-content">' +
            '<span class="badges">' + badgesHTML + '</span>' +
            '<span class="bubble-username username" style="color:' + userColor + '">' + escapeHTML(username) + '</span>' +
            '<span class="bubble-message"' + (msgStyle ? ' style="' + msgStyle + '"' : '') + '> ' + parsedMessageHTML + '</span>' +
        '</div>';

    // Random spawn position — keep away from screen edges
    const maxL = Math.max(10, window.innerWidth  - 280);
    const maxT = Math.max(10, window.innerHeight - 120);
    el.style.left = _rand(5, maxL) + 'px';
    el.style.top  = _rand(5, maxT) + 'px';

    overlay.appendChild(el);

    // Phase 1 — blow up (double rAF ensures transition fires)
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('bubble-visible')));

    // Phase 2 — start drifting after inflate animation completes (~700ms)
    const motionScale = CONFIG.bubbleMotion || 5;
    setTimeout(function () {
        _startBubbleDrift(el, motionScale);
    }, 700);

    // Phase 3 — pop at end of lifetime
    const lifetime = CONFIG.messageLifetime > 0 ? CONFIG.messageLifetime : 8000;
    setTimeout(function () { _popBubble(el, false); }, lifetime);

    if (tags['user-id'] && typeof apply7TVCosmetics === 'function') {
        apply7TVCosmetics(tags['user-id'], el);
    }
}

// ── Event bubble (subs / bits) ─────────────────────────────────────────────────
// Returns true if handled; false to fall back to normal event message rendering.
function displayBubbleEvent(iconSvg, label, detail, typeClass) {
    const isSpecial = typeClass.includes('sub-message')  ||
                      typeClass.includes('gift-message') ||
                      typeClass.includes('bits-message');
    if (!isSpecial) return false;

    const overlay = _bubbleOverlay();
    if (!overlay) return true;

    const el = document.createElement('div');
    el.className        = 'soap-bubble soap-bubble-event';
    el.style.left       = '50%';
    el.style.top        = '40%';
    el.style.transform  = 'translateX(-50%) scale(0)';
    el.style.opacity    = '0';
    el.style.transition = 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease';

    el.innerHTML =
        '<div class="bubble-content">' +
            '<span class="bubble-event-icon">'   + iconSvg          + '</span>' +
            '<span class="bubble-event-label">'  + escapeHTML(label)  + '</span>' +
            '<span class="bubble-event-detail">' + escapeHTML(detail) + '</span>' +
        '</div>';

    overlay.appendChild(el);

    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            el.style.transform = 'translateX(-50%) scale(1)';
            el.style.opacity   = '1';
            el.classList.add('bubble-visible');
        });
    });

    // Pop after 5 seconds — snapshot position first so particles spawn at the right place
    setTimeout(function () {
        var rect = el.getBoundingClientRect();
        el.style.left      = rect.left + 'px';
        el.style.top       = rect.top  + 'px';
        el.style.transform = 'none';
        _popBubble(el, true);
    }, 5000);

    return true;
}

// ── Hype Train bubble mode ─────────────────────────────────────────────────────
var HT_BUBBLE_COUNT = 5;
var _htBubbles      = [];
var _htBubbleLevel  = 1;

function _edgePositions(n) {
    var margin = 20, bSize = 72;
    var W = window.innerWidth, H = window.innerHeight;
    var positions = [];
    for (var i = 0; i < n; i++) {
        var edge = i % 4, x, y;
        if      (edge === 0) { x = _rand(margin, W - bSize - margin); y = margin + _rand(0, 30); }
        else if (edge === 1) { x = W - bSize - margin - _rand(0, 30); y = _rand(margin + bSize, H - bSize - margin); }
        else if (edge === 2) { x = _rand(margin, W - bSize - margin); y = H - bSize - margin - _rand(0, 30); }
        else                 { x = margin + _rand(0, 30);             y = _rand(margin + bSize, H - bSize - margin); }
        positions.push({ x: x, y: y });
    }
    return positions;
}

function _buildHtBubble(pos, level) {
    var el = document.createElement('div');
    el.className        = 'ht-bubble';
    el.style.left       = pos.x + 'px';
    el.style.top        = pos.y + 'px';
    el.dataset.bobClass = _pick(_BOB_CLASSES);
    el.dataset.bobDur   = _rand(2.5, 4.5).toFixed(1);
    el.innerHTML =
        '<span class="ht-bubble-icon">🚂</span>' +
        '<span class="ht-bubble-level">LVL ' + level + '</span>';
    return el;
}

function bubbleHypeTrainShow(level) {
    var overlay = _bubbleOverlay();
    if (!overlay) return;
    _htBubbles.forEach(function (b) { b.remove(); });
    _htBubbles     = [];
    _htBubbleLevel = level || 1;

    _edgePositions(HT_BUBBLE_COUNT).forEach(function (pos, i) {
        var el = _buildHtBubble(pos, _htBubbleLevel);
        overlay.appendChild(el);
        _htBubbles.push(el);
        setTimeout(function () {
            el.classList.add('ht-bubble-visible');
            setTimeout(function () {
                el.classList.add(el.dataset.bobClass);
                el.style.setProperty('--bob-dur', el.dataset.bobDur + 's');
            }, 450);
        }, i * 120);
    });
}

function bubbleHypeTrainUpdate(level) {
    _htBubbleLevel = level || _htBubbleLevel;
    _htBubbles.forEach(function (el) {
        var lvl = el.querySelector('.ht-bubble-level');
        if (lvl) lvl.textContent = 'LVL ' + _htBubbleLevel;
        el.style.transition = 'box-shadow 0.1s';
        el.style.boxShadow  = '0 0 30px rgba(255,200,50,0.8)';
        setTimeout(function () { el.style.boxShadow = ''; el.style.transition = ''; }, 300);
    });
}

function bubbleHypeTrainEnd() {
    _htBubbles.forEach(function (el, i) {
        var angle = _rand(-40, 40);
        el.style.setProperty('--flyoff-x', Math.round(Math.sin(angle * Math.PI / 180) * 200) + 'px');
        el.style.setProperty('--flyoff-y', '-' + Math.round(_rand(250, 400)) + 'px');
        setTimeout(function () {
            _BOB_CLASSES.forEach(function (c) { el.classList.remove(c); });
            el.classList.add('ht-bubble-flying');
            setTimeout(function () { el.remove(); }, 1300);
        }, i * 100);
    });
    _htBubbles = [];
}