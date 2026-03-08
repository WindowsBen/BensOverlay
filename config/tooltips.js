// ─── config/tooltips.js ───────────────────────────────────────────────────────
// Injects a ⓘ indicator next to every setting label. Hovering shows a tooltip
// with a description and a live visual preview using the current input values.

// ── Font helper ───────────────────────────────────────────────────────────────
// Loads the configured custom font into the config page so previews use it.
let _previewFontFamily = 'sans-serif';

function _loadPreviewFont() {
    const url = document.getElementById('fontUrl')?.value?.trim();
    if (!url) { _previewFontFamily = 'sans-serif'; return; }
    // Inject the stylesheet if not already present
    if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
    }
    // Extract font-family name from the CSS
    fetch(url).then(r => r.text()).then(css => {
        const match = css.match(/font-family:\s*['"]([^'"]+)['"]/i);
        if (match) _previewFontFamily = match[1];
    }).catch(() => {});
}

// Re-load font whenever fontUrl changes
document.addEventListener('DOMContentLoaded', () => {
    _loadPreviewFont();
    document.getElementById('fontUrl')?.addEventListener('change', _loadPreviewFont);
});

// ── Color helpers ─────────────────────────────────────────────────────────────
function _hex(id, fallback = '#888888') {
    return document.getElementById(id)?.value || fallback;
}
function _op(id, fallback = 100) {
    return parseInt(document.getElementById(id)?.value ?? fallback);
}
function _rgba(colorId, opId, fallback = '#888888') {
    const hex = _hex(colorId, fallback).replace('#', '');
    const r = parseInt(hex.slice(0,2), 16);
    const g = parseInt(hex.slice(2,4), 16);
    const b = parseInt(hex.slice(4,6), 16);
    const a = _op(opId, 100) / 100;
    return `rgba(${r},${g},${b},${a})`;
}

// ── Mini animation injector ───────────────────────────────────────────────────
// Injects keyframe CSS once, then lets preview functions use the class names.
let _animCSSInjected = false;
function _ensureAnimCSS() {
    if (_animCSSInjected) return;
    _animCSSInjected = true;
    const s = document.createElement('style');
    s.textContent = `
    @keyframes tip-hammer-windup  { from { transform: rotate(0deg); } to { transform: rotate(-55deg); } }
    @keyframes tip-hammer-swing   { from { transform: rotate(-55deg); } to { transform: rotate(55deg); } }
    @keyframes tip-shockwave      { 0% { transform:scale(0); opacity:1; } 100% { transform:scale(1); opacity:0; } }
    @keyframes tip-letter-scatter { from { transform:translate(0,0) rotate(0); opacity:1; }
                                     to   { transform:translate(var(--tx),var(--ty)) rotate(var(--tr)); opacity:0; } }
    @keyframes tip-clock-descend  { from { transform:translateY(-60px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    @keyframes tip-hand-spin-fast { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes tip-letter-freeze  { 0%{opacity:1;filter:none} 60%{opacity:0.5;filter:blur(1px)} 100%{opacity:0;filter:blur(3px)} }
    `;
    document.head.appendChild(s);
}

// ── Preview builders ──────────────────────────────────────────────────────────
function _font() { return `font-family:'${_previewFontFamily}',sans-serif`; }

// Generic event message row
function _miniEvent(icon, label, name, detail, accentId, accentOpId, bgId, bgOpId) {
    const accent = _rgba(accentId, accentOpId, '#9146FF');
    const bg     = _rgba(bgId, bgOpId, '#1a0a2e');
    return `<div style="border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:5px 7px;font-size:11px;line-height:1.4;${_font()}">
        <span style="color:${accent};font-weight:700;">${icon} ${label}</span>
        <span style="color:#fff;font-weight:600;"> ${name}</span>
        <span style="color:rgba(255,255,255,0.55);"> ${detail}</span>
    </div>`;
}

// Highlighted message
function _miniHighlight(accentId, accentOpId, bgId, bgOpId) {
    const accent = _rgba(accentId, accentOpId, '#FFAA00');
    const bg     = _rgba(bgId, bgOpId, '#2a1e00');
    return `<div style="border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:5px 7px;font-size:11px;${_font()}">
        <span style="color:#1ABC9C;font-weight:700;">StreamFan42</span>
        <span style="color:rgba(255,255,255,0.85);"> ✨ This is highlighted!</span>
    </div>`;
}

// Ban animation — runs in a self-contained mini stage
function _miniBanAnimated(accentId, accentOpId) {
    _ensureAnimCSS();
    const accent = _rgba(accentId, accentOpId, '#FF4444');
    const username = 'BadUser';
    const letters = username.split('').map((ch, i) => {
        const angle = (Math.random() * 260) - 220;
        const dist  = 40 + Math.random() * 50;
        const tx    = Math.round(Math.cos(angle * Math.PI / 180) * dist);
        const ty    = Math.round(Math.sin(angle * Math.PI / 180) * dist - 20);
        const tr    = Math.round((Math.random() - 0.5) * 400);
        return `<span style="
            display:inline-block;
            color:${accent};
            font-size:15px;
            font-weight:900;
            letter-spacing:1px;
            text-transform:uppercase;
            --tx:${tx}px; --ty:${ty}px; --tr:${tr}deg;
            animation: tip-letter-scatter 0.5s ease-out ${0.75 + i*0.04}s both;
        ">${ch}</span>`;
    }).join('');

    return `<div style="position:relative;height:68px;overflow:hidden;background:rgba(0,0,0,0.5);border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
        <!-- Hammer -->
        <div style="position:absolute;top:2px;left:50%;transform:translateX(-50%);width:32px;height:32px;transform-origin:bottom center;
            animation: tip-hammer-windup 0.35s ease-out 0.05s both, tip-hammer-swing 0.2s ease-in 0.4s both;">
            <svg viewBox="0 0 64 64" fill="none" width="32" height="32">
                <rect x="28" y="28" width="9" height="30" rx="4" fill="#8B5E3C" stroke="#5C3D1E" stroke-width="1.5"/>
                <rect x="10" y="8" width="44" height="26" rx="6" fill="#C0C0C0" stroke="#888" stroke-width="1.5"/>
                <rect x="12" y="10" width="40" height="10" rx="4" fill="#E8E8E8" opacity="0.6"/>
            </svg>
        </div>
        <!-- Shockwave -->
        <div style="position:absolute;width:60px;height:60px;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);
            animation: tip-shockwave 0.35s ease-out 0.75s both;">
            <svg viewBox="0 0 120 120" fill="none" width="60" height="60">
                <circle cx="60" cy="60" r="20" stroke="white" stroke-width="3" opacity="0.9"/>
                <circle cx="60" cy="60" r="40" stroke="white" stroke-width="1.5" opacity="0.5"/>
            </svg>
        </div>
        <!-- Name letters -->
        <div style="position:relative;z-index:2;margin-top:24px;${_font()}">${letters}</div>
    </div>`;
}

// Timeout animation — clock descends, hands spin
function _miniTimeoutAnimated(accentId, accentOpId) {
    _ensureAnimCSS();
    const accent = _rgba(accentId, accentOpId, '#FF8C00');
    const username = 'BadUser';
    const letters = username.split('').map((ch, i) =>
        `<span style="display:inline-block;color:${accent};font-size:14px;font-weight:900;letter-spacing:1px;text-transform:uppercase;
            animation: tip-letter-freeze 0.5s ease-out ${1.1 + i*0.04}s both;">${ch}</span>`
    ).join('');

    return `<div style="position:relative;height:80px;overflow:hidden;background:rgba(0,0,0,0.5);border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
        <!-- Clock -->
        <div style="position:relative;width:44px;height:44px;
            animation: tip-clock-descend 0.4s cubic-bezier(0.2,0,0.2,1.3) 0.15s both;">
            <!-- Face -->
            <svg viewBox="0 0 80 80" fill="none" width="44" height="44" style="position:absolute;top:0;left:0;">
                <circle cx="40" cy="40" r="36" fill="#1a1a2e" stroke="${accent}" stroke-width="3"/>
                <line x1="40" y1="8"  x2="40" y2="16" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="40" y1="64" x2="40" y2="72" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="8"  y1="40" x2="16" y2="40" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="64" y1="40" x2="72" y2="40" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="40" cy="40" r="3" fill="${accent}"/>
            </svg>
            <!-- Hour hand -->
            <svg viewBox="0 0 80 80" fill="none" width="44" height="44" style="position:absolute;top:0;left:0;transform-origin:center center;
                animation: tip-hand-spin-fast 0.6s linear 0.7s infinite;">
                <line x1="40" y1="40" x2="40" y2="20" stroke="${accent}" stroke-width="3.5" stroke-linecap="round"/>
            </svg>
            <!-- Minute hand -->
            <svg viewBox="0 0 80 80" fill="none" width="44" height="44" style="position:absolute;top:0;left:0;transform-origin:center center;
                animation: tip-hand-spin-fast 0.18s linear 0.7s infinite;">
                <line x1="40" y1="40" x2="40" y2="12" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.9"/>
            </svg>
        </div>
        <!-- Name -->
        <div style="${_font()}">${letters}</div>
    </div>`;
}

// Shadow color swatch
function _miniShadow() {
    const color = _rgba('shadowColor', 'shadowOpacity', '#000000');
    const nameSz = Math.min(parseInt(document.getElementById('nameFontSize')?.value || 16), 16);
    return `<div style="padding:3px 0;${_font()}">
        <span style="color:#9B59B6;font-weight:700;font-size:${nameSz}px;text-shadow:2px 2px 4px ${color},0 0 8px ${color};">CoolViewer99</span>
        <span style="color:rgba(255,255,255,0.85);font-size:${nameSz - 1}px;"> Hey chat!</span>
    </div>`;
}

// Chat message (font size / font preview)
function _miniChat() {
    const nameSz = Math.min(parseInt(document.getElementById('nameFontSize')?.value  || 16), 16);
    const msgSz  = Math.min(parseInt(document.getElementById('messageFontSize')?.value || 16), 15);
    return `<div style="${_font()};padding:2px 0;">
        <span style="color:#9B59B6;font-weight:700;font-size:${nameSz}px;">CoolViewer99</span>
        <span style="color:rgba(255,255,255,0.85);font-size:${msgSz}px;"> Hey, great stream!</span>
    </div>`;
}

// Poll widget
function _miniPoll() {
    const accent = _rgba('pollAccent','pollAccentOpacity','#A970FF');
    const bg     = _rgba('pollBg','pollBgOpacity','#0e0e1e');
    const bar    = _rgba('pollBar','pollBarOpacity','#A970FF');
    const winner = _rgba('pollWinner','pollWinnerOpacity','#FFD700');
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:6px;padding:7px 9px;font-size:10px;${_font()};width:100%;box-sizing:border-box;">
        <div style="color:${accent};font-weight:700;margin-bottom:5px;">📊 What game next?</div>
        ${[['Elden Ring','72%',true],['Hollow Knight','28%',false]].map(([t,p,w]) => `
        <div style="margin-bottom:4px;">
            <div style="display:flex;justify-content:space-between;color:${w?winner:'rgba(255,255,255,0.7)'};font-weight:${w?700:400};font-size:9px;margin-bottom:2px;"><span>${t}</span><span>${p}</span></div>
            <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;"><div style="height:100%;width:${p};background:${w?winner:bar};border-radius:2px;"></div></div>
        </div>`).join('')}
    </div>`;
}

// Prediction widget
function _miniPred() {
    const bg = _rgba('predBg','predBgOpacity','#0d0d1a');
    const colors = ['#5b8dd9','#d95b5b'];
    return `<div style="background:${bg};border:1px solid rgba(169,112,255,0.4);border-radius:6px;padding:7px 9px;font-size:10px;${_font()};width:100%;box-sizing:border-box;">
        <div style="color:rgba(255,255,255,0.8);font-weight:700;margin-bottom:5px;">Will I beat the boss?</div>
        ${[['Yes, ez clap','62%',0],['No chance','38%',1]].map(([t,p,i]) => `
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
            <div style="width:6px;height:6px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></div>
            <span style="color:rgba(255,255,255,0.75);flex:1;">${t}</span>
            <span style="color:${colors[i]};font-weight:700;">${p}</span>
        </div>`).join('')}
    </div>`;
}

// Hype train bar
function _miniHypeTrain() {
    const accent = _rgba('htAccent','htAccentOpacity','#FF6B35');
    const bg     = _rgba('htBg','htBgOpacity','#1a0a00');
    const bar    = _rgba('htBar','htBarOpacity','#FF6B35');
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:5px;padding:5px 8px;display:flex;align-items:center;gap:7px;${_font()}">
        <span style="color:${accent};font-size:9px;font-weight:800;letter-spacing:1px;white-space:nowrap;">🚂 HYPE TRAIN</span>
        <div style="background:${accent};border-radius:3px;padding:1px 5px;font-size:11px;font-weight:900;color:#fff;">2</div>
        <div style="flex:1;"><div style="height:5px;background:rgba(255,255,255,0.1);border-radius:3px;"><div style="width:55%;height:100%;background:${bar};border-radius:3px;box-shadow:0 0 5px ${bar};"></div></div></div>
        <span style="color:rgba(255,255,255,0.4);font-size:9px;">142s</span>
    </div>`;
}

// ── Settings map ──────────────────────────────────────────────────────────────
const SETTING_TIPS = {
    channel:          { desc: 'The Twitch channel name to connect to (without the #).' },
    nameFontSize:     { desc: 'Size of the username text in chat messages.',      preview: _miniChat },
    messageFontSize:  { desc: 'Size of the message body text in chat messages.',  preview: _miniChat },
    shadowColor:      { desc: 'Drop-shadow color and opacity applied behind usernames.', preview: _miniShadow },
    fontUrl:          { desc: 'URL of a custom web font (e.g. a Google Fonts CSS link). Leave blank for the default font.', preview: _miniChat },
    messageGap:       { desc: 'Vertical space between chat messages (px). Leave blank for default.' },
    lineHeight:       { desc: 'Line spacing within a message. Leave blank for default (e.g. 1.4).' },
    slideDistance:    { desc: 'How far new messages slide up from below before settling (px).' },
    slideDuration:    { desc: 'How long the slide-in animation takes (ms).' },
    messageLifetime:  { desc: 'How many ms before a message fades out. 0 = stay on screen forever.' },
    fadeDuration:     { desc: 'How long the fade-out animation takes (ms).' },
    excludedUsers:    { desc: 'Comma-separated usernames to hide (e.g. Nightbot, StreamElements).' },
    excludedPrefixes: { desc: 'Hide messages starting with these prefixes. Comma-separated (e.g. ! hides bot commands).' },
    showAnnouncements:{ desc: 'Show /announce messages posted by mods or the broadcaster.' },
    showReplies:      { desc: 'Show the quoted parent message above reply messages.' },
    toastEmotes:      { desc: 'Float emote-only messages as a large emote above chat.' },
    meStyle:          { desc: 'How /me action messages are styled — colored, italic, or plain.', preview: _miniChat },
    disableAllBadges:      { desc: 'Hide every badge — Twitch, 7TV, FFZ, and Chatterino.' },
    roleOnlyBadges:        { desc: 'Only show Broadcaster, Mod, and VIP badges.' },
    showExternalCosmetics: { desc: 'Show third-party badges and name paints from 7TV, BTTV, and FFZ.' },

    showResubs:  { desc: 'Show an event message when someone subscribes or resubscribes.',
                   preview: () => _miniEvent('⭐','subscribed for','CoolViewer99','6 months','resubAccent','resubAccentOpacity','resubBg','resubBgOpacity') },
    resubAccent: { desc: 'Border and icon color for resub event messages.',
                   preview: () => _miniEvent('⭐','subscribed for','CoolViewer99','6 months','resubAccent','resubAccentOpacity','resubBg','resubBgOpacity') },
    resubBg:     { desc: 'Background color for resub event messages.',
                   preview: () => _miniEvent('⭐','subscribed for','CoolViewer99','6 months','resubAccent','resubAccentOpacity','resubBg','resubBgOpacity') },
    resubLabel:  { desc: 'Custom verb in resub messages.',
                   preview: () => _miniEvent('⭐', document.getElementById('resubLabel')?.value||'subscribed for','CoolViewer99','6 months','resubAccent','resubAccentOpacity','resubBg','resubBgOpacity') },

    showGifts:   { desc: 'Show an event message when someone gifts subscriptions.',
                   preview: () => _miniEvent('🎁','gifted a sub to','StreamFan42','LuckyRecipient','giftAccent','giftAccentOpacity','giftBg','giftBgOpacity') },
    giftAccent:  { desc: 'Border and icon color for gift sub messages.',
                   preview: () => _miniEvent('🎁','gifted a sub to','StreamFan42','LuckyRecipient','giftAccent','giftAccentOpacity','giftBg','giftBgOpacity') },
    giftBg:      { desc: 'Background color for gift sub messages.',
                   preview: () => _miniEvent('🎁','gifted a sub to','StreamFan42','LuckyRecipient','giftAccent','giftAccentOpacity','giftBg','giftBgOpacity') },
    giftLabel:   { desc: 'Custom verb in gift messages.',
                   preview: () => _miniEvent('🎁', document.getElementById('giftLabel')?.value||'gifted a sub to','StreamFan42','LuckyRecipient','giftAccent','giftAccentOpacity','giftBg','giftBgOpacity') },

    showBits:    { desc: 'Show an event message when someone cheers with bits.',
                   preview: () => _miniEvent('💎','cheered','ChatLurker99','100 bits','bitsAccent','bitsAccentOpacity','bitsBg','bitsBgOpacity') },
    bitsAccent:  { desc: 'Border and icon color for cheer messages.',
                   preview: () => _miniEvent('💎','cheered','ChatLurker99','100 bits','bitsAccent','bitsAccentOpacity','bitsBg','bitsBgOpacity') },
    bitsBg:      { desc: 'Background color for cheer messages.',
                   preview: () => _miniEvent('💎','cheered','ChatLurker99','100 bits','bitsAccent','bitsAccentOpacity','bitsBg','bitsBgOpacity') },
    bitsLabel:   { desc: 'Custom verb in cheer messages.',
                   preview: () => _miniEvent('💎', document.getElementById('bitsLabel')?.value||'cheered','ChatLurker99','100 bits','bitsAccent','bitsAccentOpacity','bitsBg','bitsBgOpacity') },

    showRedeems:  { desc: 'Show an event message for channel point redemptions. Requires your own token.',
                    preview: () => _miniEvent('⚡','redeemed','StreamFan42','Hydrate!','redeemAccent','redeemAccentOpacity','redeemBg','redeemBgOpacity') },
    redeemAccent: { desc: 'Border and icon color for redemption messages.',
                    preview: () => _miniEvent('⚡','redeemed','StreamFan42','Hydrate!','redeemAccent','redeemAccentOpacity','redeemBg','redeemBgOpacity') },
    redeemBg:     { desc: 'Background color for redemption messages.',
                    preview: () => _miniEvent('⚡','redeemed','StreamFan42','Hydrate!','redeemAccent','redeemAccentOpacity','redeemBg','redeemBgOpacity') },
    redeemLabel:  { desc: 'Custom verb in redemption messages.',
                    preview: () => _miniEvent('⚡', document.getElementById('redeemLabel')?.value||'redeemed','StreamFan42','Hydrate!','redeemAccent','redeemAccentOpacity','redeemBg','redeemBgOpacity') },

    showBans:  { desc: 'Play the hammer animation when a user is banned.',
                 preview: () => _miniBanAnimated('banAccent','banAccentOpacity') },
    banAccent: { desc: 'Accent color for the ban animation.',
                 preview: () => _miniBanAnimated('banAccent','banAccentOpacity') },
    banBg:     { desc: 'Background color for the ban animation overlay.',
                 preview: () => _miniBanAnimated('banAccent','banAccentOpacity') },

    showTimeouts:  { desc: 'Play the clock animation when a user is timed out.',
                     preview: () => _miniTimeoutAnimated('timeoutAccent','timeoutAccentOpacity') },
    timeoutAccent: { desc: 'Accent color for the timeout animation.',
                     preview: () => _miniTimeoutAnimated('timeoutAccent','timeoutAccentOpacity') },
    timeoutBg:     { desc: 'Background color for the timeout animation overlay.',
                     preview: () => _miniTimeoutAnimated('timeoutAccent','timeoutAccentOpacity') },

    showHighlights:  { desc: 'Show highlighted messages with a distinct background and border.',
                       preview: () => _miniHighlight('highlightAccent','highlightAccentOpacity','highlightBg','highlightBgOpacity') },
    highlightAccent: { desc: 'Border and glow color for highlighted messages.',
                       preview: () => _miniHighlight('highlightAccent','highlightAccentOpacity','highlightBg','highlightBgOpacity') },
    highlightBg:     { desc: 'Background color for highlighted messages.',
                       preview: () => _miniHighlight('highlightAccent','highlightAccentOpacity','highlightBg','highlightBgOpacity') },

    showStreaks:  { desc: 'Show an event message for watch streak milestones.',
                   preview: () => _miniEvent('🔥','watch streak:','NightOwl','30 days','streakAccent','streakAccentOpacity','streakBg','streakBgOpacity') },
    streakAccent: { desc: 'Border and icon color for watch streak messages.',
                   preview: () => _miniEvent('🔥','watch streak:','NightOwl','30 days','streakAccent','streakAccentOpacity','streakBg','streakBgOpacity') },
    streakBg:     { desc: 'Background color for watch streak messages.',
                   preview: () => _miniEvent('🔥','watch streak:','NightOwl','30 days','streakAccent','streakAccentOpacity','streakBg','streakBgOpacity') },
    streakLabel:  { desc: 'Custom label text in watch streak messages.',
                   preview: () => _miniEvent('🔥', document.getElementById('streakLabel')?.value||'watch streak:','NightOwl','30 days','streakAccent','streakAccentOpacity','streakBg','streakBgOpacity') },

    showRaidIncoming:   { desc: 'Show an event message when another channel raids you.',
                          preview: () => _miniEvent('🚀','is raiding with','BigRaider','250 viewers','raidIncomingAccent','raidIncomingAccentOpacity','raidIncomingBg','raidIncomingBgOpacity') },
    raidIncomingAccent: { desc: 'Border and icon color for incoming raid messages.',
                          preview: () => _miniEvent('🚀','is raiding with','BigRaider','250 viewers','raidIncomingAccent','raidIncomingAccentOpacity','raidIncomingBg','raidIncomingBgOpacity') },
    raidIncomingBg:     { desc: 'Background color for incoming raid messages.',
                          preview: () => _miniEvent('🚀','is raiding with','BigRaider','250 viewers','raidIncomingAccent','raidIncomingAccentOpacity','raidIncomingBg','raidIncomingBgOpacity') },
    raidIncomingLabel:  { desc: 'Custom verb in incoming raid messages.',
                          preview: () => _miniEvent('🚀', document.getElementById('raidIncomingLabel')?.value||'is raiding with','BigRaider','250 viewers','raidIncomingAccent','raidIncomingAccentOpacity','raidIncomingBg','raidIncomingBgOpacity') },
    showRaidOutgoing:   { desc: 'Show an event message when you raid another channel. Requires your own token.',
                          preview: () => _miniEvent('🚀','raiding','You','FriendlyStreamer','raidOutgoingAccent','raidOutgoingAccentOpacity','raidOutgoingBg','raidOutgoingBgOpacity') },
    raidOutgoingAccent: { desc: 'Border and icon color for outgoing raid messages.',
                          preview: () => _miniEvent('🚀','raiding','You','FriendlyStreamer','raidOutgoingAccent','raidOutgoingAccentOpacity','raidOutgoingBg','raidOutgoingBgOpacity') },
    raidOutgoingBg:     { desc: 'Background color for outgoing raid messages.',
                          preview: () => _miniEvent('🚀','raiding','You','FriendlyStreamer','raidOutgoingAccent','raidOutgoingAccentOpacity','raidOutgoingBg','raidOutgoingBgOpacity') },
    raidOutgoingLabel:  { desc: 'Custom verb in outgoing raid messages.',
                          preview: () => _miniEvent('🚀', document.getElementById('raidOutgoingLabel')?.value||'raiding','You','FriendlyStreamer','raidOutgoingAccent','raidOutgoingAccentOpacity','raidOutgoingBg','raidOutgoingBgOpacity') },

    showPolls:    { desc: 'Show an active poll widget in the center of the overlay. Requires your own token.', preview: _miniPoll },
    pollAccent:   { desc: 'Border, icon, and percentage text color for the poll widget.', preview: _miniPoll },
    pollBg:       { desc: 'Background color for the poll widget.', preview: _miniPoll },
    pollBar:      { desc: 'Fill color for poll vote bars.', preview: _miniPoll },
    pollWinner:   { desc: 'Color used to highlight the winning choice when the poll ends.', preview: _miniPoll },
    pollLingerMs: { desc: 'How long (ms) the poll widget stays visible after the poll ends.' },

    showPredictions:    { desc: 'Show an active prediction widget in the center of the overlay. Requires your own token.', preview: _miniPred },
    predBg:             { desc: 'Background color for the prediction widget.', preview: _miniPred },
    predWinnerGlow:     { desc: 'Glow color pulsed on the widget border when a prediction is resolved.', preview: _miniPred },
    predictionLingerMs: { desc: 'How long (ms) the prediction widget stays visible after locking, resolving, or canceling.' },

    showHypeTrain:     { desc: 'Show a hype train progress bar at the top of the overlay. Requires your own token.', preview: _miniHypeTrain },
    htAccent:          { desc: 'Border, icon, and label color for the hype train widget.', preview: _miniHypeTrain },
    htBg:              { desc: 'Background color for the hype train widget.', preview: _miniHypeTrain },
    htBar:             { desc: 'Fill color of the hype train progress bar.', preview: _miniHypeTrain },
    hypeTrainLingerMs: { desc: 'How long (ms) the hype train widget stays visible after the train ends.' },
};

// ── Tooltip DOM ───────────────────────────────────────────────────────────────
let _tipEl = null;

function _createTooltip() {
    _tipEl = document.createElement('div');
    _tipEl.className = 'setting-tooltip';
    _tipEl.style.display = 'none';
    document.body.appendChild(_tipEl);
}

function _showTip(tip, anchor) {
    if (!_tipEl) return;
    let html = '';
    if (tip.preview) html += `<div class="tip-preview">${tip.preview()}</div>`;
    html += `<div class="tip-desc">${tip.desc}</div>`;
    _tipEl.innerHTML = html;

    const tipW = tip.preview ? 280 : 220;
    _tipEl.style.width   = tipW + 'px';
    _tipEl.style.display = 'block';

    const r    = anchor.getBoundingClientRect();
    let   left = r.left + r.width / 2 - tipW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));

    if (r.top > 80) {
        _tipEl.style.top       = (r.top - 8 + window.scrollY) + 'px';
        _tipEl.style.transform = 'translateY(-100%)';
    } else {
        _tipEl.style.top       = (r.bottom + 6 + window.scrollY) + 'px';
        _tipEl.style.transform = 'translateY(0)';
    }
    _tipEl.style.left = left + 'px';
}

function _hideTip() {
    if (_tipEl) _tipEl.style.display = 'none';
}

// ── Injection ─────────────────────────────────────────────────────────────────
function injectSettingTips() {
    _createTooltip();

    Object.entries(SETTING_TIPS).forEach(([id, tip]) => {
        const el = document.getElementById(id);
        if (!el) return;

        let labelTarget = null;

        // 1 — checkbox → .cb-label
        const wrapper = el.closest('.checkbox-wrapper');
        if (wrapper) labelTarget = wrapper.querySelector('.cb-label');

        // 2 — row → .option-label in same row
        if (!labelTarget) {
            const row = el.closest('.event-option-row, .text-override-row');
            if (row) labelTarget = row.querySelector('.option-label');
        }

        // 3 — preceding sibling .field-label
        if (!labelTarget) {
            let sib = el.previousElementSibling;
            while (sib) {
                if (sib.classList.contains('field-label')) { labelTarget = sib; break; }
                sib = sib.previousElementSibling;
            }
        }

        // 4 — fallback: nearest .tab-section-title
        if (!labelTarget) {
            const section = el.closest('.tab-section');
            if (section) labelTarget = section.querySelector('.tab-section-title');
        }

        if (!labelTarget || labelTarget.querySelector('.setting-tip-icon')) return;

        const icon = document.createElement('span');
        icon.className = 'setting-tip-icon';
        icon.textContent = 'ⓘ';
        icon.addEventListener('mouseenter', () => _showTip(tip, icon));
        icon.addEventListener('mouseleave', _hideTip);
        labelTarget.appendChild(icon);
    });
}

document.addEventListener('DOMContentLoaded', injectSettingTips);