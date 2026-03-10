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
        '#bubble-overlay {',
        '    position:fixed; inset:0;',
        '    pointer-events:none; overflow:hidden; z-index:10;',
        '}',

        // ── Base soap bubble shell ───────────────────────────────────────────
        '.soap-bubble {',
        '    position:absolute;',
        '    min-width:140px; max-width:270px;',
        '    border-radius:999px;',
        '    padding:12px 18px;',
        '    background:transparent;',
        '    box-shadow:inset 0 0 25px rgba(255,255,255,0.08);',
        '    color:rgba(255,255,255,0.95);',
        '    font-size:var(--message-font-size,15px);',
        '    font-family:var(--chat-font-family,sans-serif);',
        '    line-height:1.4; word-break:break-word;',
        '    pointer-events:none;',
        '    isolation:isolate; overflow:hidden;',
        '    transform:scale(0); opacity:0;',
        '    transition:transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;',
        '}',
        '.soap-bubble.bubble-visible { opacity:1; transform:scale(1); }',

        // ── Iridescent span layers (Uiverse.io technique) ────────────────────
        '.soap-bubble span.b-s {',
        '    position:absolute; border-radius:50%; pointer-events:none;',
        '}',
        '.soap-bubble span.b-s:nth-child(1){inset:6px; border-left:  12px solid #0fb4ff;filter:blur(7px);}',
        '.soap-bubble span.b-s:nth-child(2){inset:6px; border-right: 12px solid #ff4484;filter:blur(7px);}',
        '.soap-bubble span.b-s:nth-child(3){inset:6px; border-top:   12px solid #ffeb3b;filter:blur(7px);}',
        '.soap-bubble span.b-s:nth-child(4){inset:20px;border-left:  12px solid #ff4484;filter:blur(10px);}',
        '.soap-bubble span.b-s:nth-child(5){inset:6px; border-bottom:8px  solid #fff;   filter:blur(7px);transform:rotate(330deg);}',

        // ── White highlight blobs ─────────────────────────────────────────────
        '.soap-bubble::before{',
        '    content:"";position:absolute;',
        '    top:22%;left:14%;width:18px;height:18px;',
        '    border-radius:50%;background:#fff;z-index:10;filter:blur(2px);pointer-events:none;',
        '}',
        '.soap-bubble::after{',
        '    content:"";position:absolute;',
        '    top:40%;left:26%;width:12px;height:12px;',
        '    border-radius:50%;background:#fff;z-index:10;filter:blur(2px);pointer-events:none;',
        '}',

        // ── Content floats above the color spans ──────────────────────────────
        '.bubble-content{position:relative;z-index:5;}',

        // ── Drift animations ──────────────────────────────────────────────────
        '@keyframes bubble-drift-a{',
        '  0%  {translate:0px 0px;}   30%{translate:18px -28px;}',
        '  60% {translate:-12px -55px;} 100%{translate:8px -90px;}',
        '}',
        '@keyframes bubble-drift-b{',
        '  0%  {translate:0px 0px;}   35%{translate:-22px -20px;}',
        '  65% {translate:10px -52px;} 100%{translate:-16px -80px;}',
        '}',
        '@keyframes bubble-drift-c{',
        '  0%  {translate:0px 0px;}   40%{translate:25px -15px;}',
        '  70% {translate:5px -48px;}  100%{translate:20px -75px;}',
        '}',
        '@keyframes bubble-drift-d{',
        '  0%  {translate:0px 0px;}   30%{translate:-8px -35px;}',
        '  60% {translate:15px -58px;} 100%{translate:-5px -88px;}',
        '}',
        '.bubble-drift-a{animation:bubble-drift-a var(--drift-dur,7s) ease-in-out forwards;}',
        '.bubble-drift-b{animation:bubble-drift-b var(--drift-dur,7s) ease-in-out forwards;}',
        '.bubble-drift-c{animation:bubble-drift-c var(--drift-dur,7s) ease-in-out forwards;}',
        '.bubble-drift-d{animation:bubble-drift-d var(--drift-dur,7s) ease-in-out forwards;}',

        // ── Pop ───────────────────────────────────────────────────────────────
        '@keyframes bubble-pop{',
        '  0%  {transform:scale(1);   opacity:1; filter:brightness(1);}',
        '  35% {transform:scale(1.15);opacity:0.9;filter:brightness(2);}',
        '  100%{transform:scale(0.05);opacity:0;}',
        '}',
        '.bubble-popping{animation:bubble-pop 0.25s ease-in forwards !important;}',

        // ── Pop particles ─────────────────────────────────────────────────────
        '.bubble-particle,.bubble-sparkle{',
        '    position:absolute;border-radius:50%;opacity:1;pointer-events:none;',
        '    animation:bubble-particle-fly var(--fly-dur,0.5s) ease-out forwards;',
        '}',
        '@keyframes bubble-particle-fly{',
        '  0%  {translate:0 0;opacity:1;scale:1;}',
        '  100%{translate:var(--fx) var(--fy);opacity:0;scale:0.2;}',
        '}',

        // ── Event bubble (subs / bits) ────────────────────────────────────────
        '.soap-bubble-event{',
        '    min-width:200px;max-width:340px;padding:18px 24px;border-radius:999px;',
        '    box-shadow:inset 0 0 40px rgba(255,255,255,0.10),0 0 30px rgba(160,100,255,0.35);',
        '}',
        '.soap-bubble-event::before{width:24px;height:24px;top:18%;left:12%;filter:blur(3px);}',
        '.soap-bubble-event::after {width:16px;height:16px;top:38%;left:24%;filter:blur(3px);}',
        '.soap-bubble-event span.b-s:nth-child(1){inset:8px; border-left:  16px solid #0fb4ff;filter:blur(10px);}',
        '.soap-bubble-event span.b-s:nth-child(2){inset:8px; border-right: 16px solid #ff4484;filter:blur(10px);}',
        '.soap-bubble-event span.b-s:nth-child(3){inset:8px; border-top:   16px solid #ffeb3b;filter:blur(10px);}',
        '.soap-bubble-event span.b-s:nth-child(4){inset:25px;border-left:  16px solid #a855f7;filter:blur(14px);}',
        '.soap-bubble-event span.b-s:nth-child(5){inset:8px; border-bottom:12px solid #fff;   filter:blur(10px);transform:rotate(330deg);}',
        '@keyframes event-bubble-glow{',
        '  0%,100%{box-shadow:inset 0 0 40px rgba(255,255,255,0.10),0 0 25px rgba(160,100,255,0.35);}',
        '  50%    {box-shadow:inset 0 0 40px rgba(255,255,255,0.10),0 0 50px rgba(160,100,255,0.65),0 0 80px rgba(80,160,255,0.25);}',
        '}',
        '.soap-bubble-event.bubble-visible{animation:event-bubble-glow 2s ease-in-out infinite;}',

        // ── Inner text layout ─────────────────────────────────────────────────
        '.bubble-username{font-weight:700;font-size:var(--name-font-size,15px);display:inline;}',
        '.bubble-message {display:inline;color:rgba(255,255,255,0.9);}',
        '.bubble-event-icon  {display:block;font-size:22px;text-align:center;margin-bottom:5px;}',
        '.bubble-event-label {display:block;font-weight:800;font-size:14px;letter-spacing:0.5px;text-align:center;margin-bottom:2px;}',
        '.bubble-event-detail{display:block;font-size:11px;text-align:center;color:rgba(255,255,255,0.6);font-style:italic;}',

        // ── Hype train edge bubbles ───────────────────────────────────────────
        '.ht-bubble{',
        '    position:absolute;width:72px;height:72px;border-radius:50%;',
        '    background:transparent;box-shadow:inset 0 0 20px rgba(255,255,255,0.08);',
        '    overflow:hidden;isolation:isolate;',
        '    display:flex;flex-direction:column;align-items:center;justify-content:center;',
        '    pointer-events:none;opacity:0;transform:scale(0);',
        '    transition:opacity 0.4s ease,transform 0.4s cubic-bezier(0.34,1.56,0.64,1);',
        '}',
        '.ht-bubble::before{',
        '    content:"";position:absolute;top:14%;left:18%;width:10px;height:10px;',
        '    border-radius:50%;background:#fff;z-index:10;filter:blur(1.5px);',
        '}',
        '.ht-bubble::after{',
        '    content:"";position:absolute;top:28%;left:28%;width:7px;height:7px;',
        '    border-radius:50%;background:#fff;z-index:10;filter:blur(1.5px);',
        '}',
        '.ht-bubble span.b-s{position:absolute;border-radius:50%;pointer-events:none;}',
        '.ht-bubble span.b-s:nth-child(1){inset:4px; border-left:  8px solid #FF6B35;filter:blur(5px);}',
        '.ht-bubble span.b-s:nth-child(2){inset:4px; border-right: 8px solid #ff4484;filter:blur(5px);}',
        '.ht-bubble span.b-s:nth-child(3){inset:4px; border-top:   8px solid #ffeb3b;filter:blur(5px);}',
        '.ht-bubble span.b-s:nth-child(4){inset:12px;border-left:  8px solid #ff4484;filter:blur(7px);}',
        '.ht-bubble span.b-s:nth-child(5){inset:4px; border-bottom:6px  solid #fff;  filter:blur(5px);transform:rotate(330deg);}',
        '.ht-bubble.ht-bubble-visible{opacity:1;transform:scale(1);}',
        '.ht-bubble-icon {position:relative;z-index:5;font-size:20px;line-height:1;}',
        '.ht-bubble-level{position:relative;z-index:5;font-size:9px;font-weight:800;color:rgba(255,220,120,0.95);letter-spacing:0.5px;margin-top:2px;}',

        '@keyframes ht-bubble-bob-a{0%,100%{translate:0 -8px;}50%{translate: 6px 8px;}}',
        '@keyframes ht-bubble-bob-b{0%,100%{translate:0 -8px;}50%{translate:-8px 8px;}}',
        '@keyframes ht-bubble-bob-c{0%,100%{translate:0 -8px;}50%{translate:10px 6px;}}',
        '.ht-bubble-bob-a{animation:ht-bubble-bob-a var(--bob-dur,3s) ease-in-out infinite;}',
        '.ht-bubble-bob-b{animation:ht-bubble-bob-b var(--bob-dur,3s) ease-in-out infinite;}',
        '.ht-bubble-bob-c{animation:ht-bubble-bob-c var(--bob-dur,3s) ease-in-out infinite;}',

        '@keyframes ht-bubble-flyoff{',
        '  0%  {opacity:1;}',
        '  100%{opacity:0;translate:var(--flyoff-x,0px) var(--flyoff-y,-300px);}',
        '}',
        '.ht-bubble-flying{animation:ht-bubble-flyoff 1.2s ease-in forwards !important;}',
    ].join('\n');
    document.head.appendChild(s);
})();

// ── Utilities ──────────────────────────────────────────────────────────────────
const _DRIFT_CLASSES  = ['bubble-drift-a','bubble-drift-b','bubble-drift-c','bubble-drift-d'];
const _BOB_CLASSES    = ['ht-bubble-bob-a','ht-bubble-bob-b','ht-bubble-bob-c'];
const _SPARKLE_COLORS = [
    '#ffffff','#ffe0ff','#e0f0ff','#ffd0a0',
    '#c0e0ff','#ffb0e0','#b0ffe0','#fff0a0',
];

function _rand(min, max)  { return min + Math.random() * (max - min); }
function _pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }
function _bubbleOverlay() { return document.getElementById('bubble-overlay'); }

// Shared iridescent span markup — same 5 spans used in every bubble type
const _SPANS = '<span class="b-s"></span><span class="b-s"></span><span class="b-s"></span><span class="b-s"></span><span class="b-s"></span>';

// ── Pop effect ─────────────────────────────────────────────────────────────────
// Triggers the collapse animation, spawns colour particles at the bubble center,
// then removes the element from the DOM.
function _popBubble(el, isEvent) {
    el.classList.add('bubble-popping');

    const rect    = el.getBoundingClientRect();
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
        _SPANS +
        '<div class="bubble-content">' +
            '<span class="badges">' + badgesHTML + '</span>' +
            '<span class="bubble-username" style="color:' + userColor + '">' + escapeHTML(username) + '</span>' +
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

    // Phase 2 — start drifting after blow-up settles (~450ms)
    const driftDur = _rand(5, 9);
    setTimeout(function () {
        el.classList.add(_pick(_DRIFT_CLASSES));
        el.style.setProperty('--drift-dur', driftDur + 's');
    }, 450);

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
        _SPANS +
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
        _SPANS +
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