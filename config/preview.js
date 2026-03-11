// ─── config/preview.js ────────────────────────────────────────────────────────
// Renders a live-updating mini chat window on the right side of the config page.
// Every input/change event in the page re-renders the preview so the user can
// see the effect of their settings in real time without generating a link.

// ── Font loading ──────────────────────────────────────────────────────────────
let _previewFontFamily = '';

function _loadPreviewFont() {
    const url = document.getElementById('fontUrl')?.value?.trim();
    if (!url) { _previewFontFamily = ''; return; }
    if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
    }
    fetch(url).then(r => r.text()).then(css => {
        const match = css.match(/font-family:\s*['"]([^'"]+)['"]/i);
        if (match) {
            _previewFontFamily = match[1];
            document.fonts.load(`16px "${_previewFontFamily}"`).finally(renderChatPreview);
        }
    }).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _pv(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? (el.value ?? fallback) : fallback;
}
function _pc(id, fallback = '#888888') {
    const el = document.getElementById(id);
    return (el && el.value) ? el.value : fallback;
}
function _po(id, fallback = 100) {
    const el = document.getElementById(id);
    return el ? parseInt(el.value ?? fallback) : fallback;
}
function _prgba(colorId, opId, fallback = '#888888') {
    try {
        const hex = _pc(colorId, fallback).replace('#', '');
        const r = parseInt(hex.slice(0,2)||'88', 16);
        const g = parseInt(hex.slice(2,4)||'88', 16);
        const b = parseInt(hex.slice(4,6)||'88', 16);
        const a = _po(opId, 100) / 100;
        return `rgba(${r},${g},${b},${a})`;
    } catch { return fallback; }
}
function _pfont() {
    return _previewFontFamily ? `font-family:'${_previewFontFamily}',sans-serif;` : '';
}
function _pnum(id, fallback) {
    const v = parseInt(_pv(id, ''));
    return isNaN(v) ? fallback : v;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
function _msgWrap(extra = '') {
    const gap = _pnum('messageGap', 8);
    const lh  = parseFloat(_pv('lineHeight', '')) || 1.4;
    const fs  = _pnum('messageFontSize', 15);
    return `font-size:${fs}px;line-height:${lh};margin-bottom:${gap}px;word-break:break-word;${_pfont()}${extra}`;
}

function _nameSpan(name, color) {
    const sc     = _prgba('shadowColor','shadowOpacity','#000000');
    const ns     = _pnum('nameFontSize', 15);
    const shadow = `text-shadow:1px 1px 3px ${sc},0 0 6px ${sc};`;
    return `<span style="color:${color};font-weight:700;font-size:${ns}px;${shadow}${_pfont()}">${name}</span>`;
}

// ── Individual message renderers ───────────────────────────────────────────────
function _msgChat(name, color, text) {
    return `<div style="${_msgWrap()}">${_nameSpan(name, color)}<span style="color:rgba(255,255,255,0.88);"> ${text}</span></div>`;
}

function _msgMe() {
    const style = _pv('meStyle', 'colored');
    const color = '#E91E8C';
    let ts = style === 'colored' ? `color:${color};` :
             style === 'italic'  ? 'font-style:italic;color:rgba(255,255,255,0.88);' :
                                   'color:rgba(255,255,255,0.88);';
    return `<div style="${_msgWrap()}">${_nameSpan('PurpleFox', color)}<span style="${ts}"> * dances in the chat</span></div>`;
}

function _msgHighlight() {
    const accent = _prgba('highlightAccent','highlightAccentOpacity','#FFAA00');
    const bg     = _prgba('highlightBg','highlightBgOpacity','#2a1e00');
    return `<div style="${_msgWrap(`border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:5px 8px;`)}">${_nameSpan('GoldViewer','#FFD700')}<span style="color:rgba(255,255,255,0.9);"> ✨ This message is highlighted!</span></div>`;
}

function _msgReply() {
    return `<div style="${_msgWrap()}">
        <div style="font-size:0.8em;color:rgba(255,255,255,0.45);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <svg style="width:10px;height:10px;vertical-align:middle;margin-right:2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            <span style="color:rgba(255,255,255,0.6);font-weight:600;">StreamerDude</span> lol nice one
        </div>
        ${_nameSpan('RegularFan','#3498DB')}<span style="color:rgba(255,255,255,0.88);"> @StreamerDude haha same</span>
    </div>`;
}

function _msgEvent(icon, name, detail, aId, aOId, bId, bOId, extra='') {
    const accent = _prgba(aId, aOId, '#9146FF');
    const bg     = _prgba(bId, bOId, '#1a0a2e');
    return `<div style="${_msgWrap(`border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:6px 8px;display:flex;align-items:flex-start;gap:7px;`)}">
        <span style="color:${accent};flex-shrink:0;font-size:16px;margin-top:1px;">${icon}</span>
        <span>
            <span style="color:${accent};font-weight:700;">${name}</span>
            <span style="color:rgba(220,210,255,0.85);font-style:italic;"> ${detail}</span>
            ${extra ? `<span style="display:block;margin-top:3px;color:rgba(255,255,255,0.75);">${extra}</span>` : ''}
        </span>
    </div>`;
}

function _msgAnnouncement() {
    // Uses a fixed primary colour — colour variants only differ in border hue
    const accent = 'rgba(169,112,255,0.85)';
    const bg     = 'rgba(80,40,160,0.15)';
    const ICON   = `<svg style="width:13px;height:13px;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
    const gap    = _pnum('messageGap', 8);
    const lh     = parseFloat(_pv('lineHeight','')) || 1.4;
    return `<div style="border-left:3px solid ${accent};background:${bg};border-radius:4px;padding:6px 8px;margin-bottom:${gap}px;line-height:${lh};${_pfont()}">
        <div style="color:${accent};font-size:11px;font-weight:700;margin-bottom:3px;">${ICON}Announcement</div>
        ${_nameSpan('ModeratorBot','#9146FF')}<span style="color:rgba(255,255,255,0.88);"> Remember to follow the community guidelines! 📋</span>
    </div>`;
}

function _msgBan() {
    const accent = _prgba('banAccent','banAccentOpacity','#FF4444');
    const bg     = _prgba('banBg','banBgOpacity','#2a0000');
    const gap    = _pnum('messageGap', 8);
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:5px;padding:8px 10px;margin-bottom:${gap}px;display:flex;align-items:center;gap:8px;${_pfont()}">
        <svg style="width:20px;height:20px;flex-shrink:0;color:${accent};" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
        <span style="color:${accent};font-weight:700;font-size:13px;">BadUser</span>
        <span style="color:rgba(255,255,255,0.55);font-size:12px;">was banned</span>
    </div>`;
}

function _msgTimeout() {
    const accent = _prgba('timeoutAccent','timeoutAccentOpacity','#FF8C00');
    const bg     = _prgba('timeoutBg','timeoutBgOpacity','#1a1200');
    const gap    = _pnum('messageGap', 8);
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:5px;padding:8px 10px;margin-bottom:${gap}px;display:flex;align-items:center;gap:8px;${_pfont()}">
        <svg style="width:20px;height:20px;flex-shrink:0;color:${accent};" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
        <span style="color:${accent};font-weight:700;font-size:13px;">SlowpokeFan</span>
        <span style="color:rgba(255,255,255,0.55);font-size:12px;">timed out for 10m</span>
    </div>`;
}

function _widgetPoll() {
    const accent  = _prgba('pollAccent','pollAccentOpacity','#A970FF');
    const bg      = _prgba('pollBg','pollBgOpacity','#0e0e1e');
    const bar     = _prgba('pollBar','pollBarOpacity','#A970FF');
    const winner  = _prgba('pollWinner','pollWinnerOpacity','#FFD700');
    const gap     = _pnum('messageGap', 8);
    const choices = [['Elden Ring','72%',true],['Hollow Knight','28%',false]];
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:8px;padding:10px 12px;margin-bottom:${gap}px;${_pfont()}">
        <div style="color:${accent};font-weight:700;font-size:13px;margin-bottom:7px;">📊 What game next?</div>
        ${choices.map(([t,p,w]) => `
        <div style="margin-bottom:5px;">
            <div style="display:flex;justify-content:space-between;color:${w?winner:'rgba(255,255,255,0.7)'};font-weight:${w?700:400};font-size:12px;margin-bottom:3px;"><span>${t}</span><span>${p}</span></div>
            <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;"><div style="height:100%;width:${p};background:${w?winner:bar};border-radius:3px;"></div></div>
        </div>`).join('')}
        <div style="color:rgba(255,255,255,0.3);font-size:10px;margin-top:5px;">1,240 votes · 45s remaining</div>
    </div>`;
}

function _widgetPrediction() {
    const bg     = _prgba('predBg','predBgOpacity','#0d0d1a');
    const glow   = _prgba('predWinnerGlow','predWinnerGlowOpacity','#FFD700');
    const gap    = _pnum('messageGap', 8);
    const colors = ['#5b8dd9','#d95b5b'];
    const opts   = [['Yes, ez clap','62%',0],['No chance','38%',1]];
    return `<div style="background:${bg};border:1px solid rgba(169,112,255,0.4);border-radius:8px;padding:10px 12px;margin-bottom:${gap}px;${_pfont()}">
        <div style="color:rgba(255,255,255,0.85);font-weight:700;font-size:13px;margin-bottom:7px;">🔮 Will I beat the boss?</div>
        ${opts.map(([t,p,i]) => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></div>
            <span style="color:rgba(255,255,255,0.75);flex:1;font-size:12px;">${t}</span>
            <span style="color:${colors[i]};font-weight:700;font-size:12px;">${p}</span>
        </div>`).join('')}
        <div style="color:rgba(255,255,255,0.3);font-size:10px;margin-top:5px;">3,800 points wagered · Locked</div>
    </div>`;
}

function _widgetHypeTrain() {
    const accent = _prgba('htAccent','htAccentOpacity','#FF6B35');
    const bg     = _prgba('htBg','htBgOpacity','#1a0a00');
    const bar    = _prgba('htBar','htBarOpacity','#FF6B35');
    const gap    = _pnum('messageGap', 8);
    return `<div style="background:${bg};border:1px solid ${accent};border-radius:8px;padding:8px 12px;margin-bottom:${gap}px;display:flex;align-items:center;gap:8px;${_pfont()}">
        <span style="color:${accent};font-size:12px;font-weight:800;letter-spacing:1px;white-space:nowrap;">🚂 HYPE TRAIN</span>
        <div style="background:${accent};border-radius:4px;padding:1px 6px;font-size:12px;font-weight:900;color:#fff;">2</div>
        <div style="flex:1;"><div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;"><div style="width:55%;height:100%;background:${bar};border-radius:3px;box-shadow:0 0 6px ${bar};"></div></div></div>
        <span style="color:rgba(255,255,255,0.35);font-size:11px;white-space:nowrap;">142s</span>
    </div>`;
}

// ── Checkbox helper ────────────────────────────────────────────────────────────
function _on(id) {
    const el = document.getElementById(id);
    return el ? el.checked : true; // default to showing if element not found
}

// ── Full preview render ────────────────────────────────────────────────────────
function renderChatPreview() {
    const panel = document.getElementById('preview-chat');
    if (!panel) return;

    const resubLabel  = _pv('resubLabel',  'resubscribed')  || 'resubscribed';
    const giftLabel   = _pv('giftLabel',   'gifted')        || 'gifted';
    const bitsLabel   = _pv('bitsLabel',   'cheered')       || 'cheered';
    const streakLabel = _pv('streakLabel', 'is on a')       || 'is on a';
    const raidLabel   = _pv('raidIncomingLabel','is raiding with') || 'is raiding with';
    const redeemLabel = _pv('redeemLabel', 'redeemed')      || 'redeemed';

    try {
        const parts = [
            _on('showHypeTrain')     && _widgetHypeTrain(),
            _msgChat('StreamerDude','#9146FF','Hey chat, welcome to the stream! 👋'),
            _msgChat('CoolViewer99','#FF6B6B','Let\'s go! PogChamp'),
            _on('showReplies')       && _msgReply(),
            _pv('meStyle','colored') !== 'none' && _msgMe(),
            _on('showAnnouncements') && _msgAnnouncement(),
            _on('showHighlights')    && _msgHighlight(),
            _on('showResubs')        && _msgEvent('⭐','NightOwl',`${resubLabel} (6 months, Tier 1)!`,'resubAccent','resubAccentOpacity','resubBg','resubBgOpacity'),
            _on('showGifts')         && _msgEvent('🎁','GenGifter',`${giftLabel} 5 Tier 1 subs to the channel!`,'giftAccent','giftAccentOpacity','giftBg','giftBgOpacity'),
            _on('showBits')          && _msgEvent('💎','BitsBoss',`${bitsLabel} 500 bits!`,'bitsAccent','bitsAccentOpacity','bitsBg','bitsBgOpacity','"GG streamers!"'),
            _on('showRedeems')       && _msgEvent('⚡','PointSpender',`${redeemLabel} Hydrate!`,'redeemAccent','redeemAccentOpacity','redeemBg','redeemBgOpacity'),
            _on('showStreaks')        && _msgEvent('🔥','MarathonFan',`${streakLabel} 30-stream watch streak!`,'streakAccent','streakAccentOpacity','streakBg','streakBgOpacity'),
            _on('showRaidIncoming')  && _msgEvent('🚀','BigRaider',`${raidLabel} 250 viewers!`,'raidIncomingAccent','raidIncomingAccentOpacity','raidIncomingBg','raidIncomingBgOpacity'),
            _on('showBans')          && _msgBan(),
            _on('showTimeouts')      && _msgTimeout(),
            _on('showPolls')         && _widgetPoll(),
            _on('showPredictions')   && _widgetPrediction(),
        ];

        const html = parts.filter(Boolean).join('');
        panel.innerHTML = html ||
            `<div style="color:rgba(255,255,255,0.25);font-size:12px;padding:12px;font-style:italic;">All messages hidden — enable some settings to see a preview.</div>`;
    } catch(e) {
        panel.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:12px;padding:8px;">Preview unavailable</div>`;
        console.warn('Preview render error:', e);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _loadPreviewFont();
    document.getElementById('fontUrl')?.addEventListener('change', _loadPreviewFont);
    renderChatPreview();
    document.addEventListener('input',  renderChatPreview);
    document.addEventListener('change', renderChatPreview);
});