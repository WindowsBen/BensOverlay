// ─── ui/hype-train.js ─────────────────────────────────────────────────────────
// Renders a persistent hype train widget at the top of the overlay.
// Subscribes to hype-train-events-v1.<channelId> via PubSub.
//
// Events handled:
//   hype-train-start       — widget slides in, progress bar begins filling
//   hype-train-progression — progress bar updates live
//   hype-train-level-up    — level badge increments, bar resets, flash animation
//   hype-train-end         — final level shown, widget lingers then slides out
//
// Layout (horizontal bar across top):
//   [ 🚂 HYPE TRAIN ] [ Level N ] [====progress bar====] [ Xpts / Ypts ] [ 99s ]

let _htEl          = null;   // widget DOM element
let _htFadeId      = null;   // setTimeout for post-end dismiss
let _htCountdownId = null;   // setInterval for expiry countdown

// ── Entry point ───────────────────────────────────────────────────────────────
function handlePubSubHypeTrain(data) {
    console.log('[HypeTrain] raw:', data?.message?.slice(0, 300));
    if (!CONFIG.showHypeTrain) { console.log('[HypeTrain] disabled'); return; }

    let inner;
    try { inner = JSON.parse(data.message); } catch { return; }

    console.log('[HypeTrain] type:', inner.type, '| data keys:', Object.keys(inner.data || {}));
    const type  = inner.type;
    const train = inner.data;
    if (!train) { console.log('[HypeTrain] no data object'); return; }

    if (type === 'hype-train-start') {
        _showHypeTrain(train);

    } else if (type === 'hype-train-progression') {
        if (_htEl) {
            _updateHypeTrain(train, false);
        } else {
            _showHypeTrain(train);
        }

    } else if (type === 'hype-train-level-up') {
        if (_htEl) {
            _levelUpHypeTrain(train);
        } else {
            _showHypeTrain(train);
        }

    } else if (type === 'hype-train-end') {
        if (_htCountdownId) { clearInterval(_htCountdownId); _htCountdownId = null; }
        if (_htEl) {
            _endHypeTrain(train);
        } else {
            _showHypeTrain(train);
            setTimeout(() => _endHypeTrain(train), 100);
        }
        _scheduleHypeTrainDismiss();
    }
}

// ── Widget creation ───────────────────────────────────────────────────────────
function _showHypeTrain(train) {
    _clearHypeTrain();

    const el = document.createElement('div');
    el.className = 'ht-widget';
    el.innerHTML = _buildHypeTrainHTML(train);
    document.getElementById('hype-train-overlay').appendChild(el);
    _htEl = el;

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ht-visible')));
    _startHypeTrainCountdown(train);
}

// ── Progress update ───────────────────────────────────────────────────────────
function _updateHypeTrain(train, levelUp) {
    if (!_htEl) return;

    const progress  = train.progress ?? train;
    const value     = progress.value     ?? 0;
    const goal      = progress.goal      ?? 1;
    const total     = progress.total     ?? value;
    const level     = progress.level     ?? train.level ?? 1;
    const pct       = Math.min(100, Math.round((value / goal) * 100));

    const bar    = _htEl.querySelector('.ht-bar-fill');
    const lvlEl  = _htEl.querySelector('.ht-level-num');
    const ptsEl  = _htEl.querySelector('.ht-pts');

    if (bar)   bar.style.width       = `${pct}%`;
    if (lvlEl) lvlEl.textContent     = level;
    if (ptsEl) ptsEl.textContent     = `${_fmtPts(value)} / ${_fmtPts(goal)}`;
}

// ── Level up ──────────────────────────────────────────────────────────────────
function _levelUpHypeTrain(train) {
    if (!_htEl) return;
    _updateHypeTrain(train, true);

    // Flash the whole widget and bounce the level badge
    _htEl.classList.remove('ht-levelup');
    void _htEl.offsetWidth; // force reflow to restart animation
    _htEl.classList.add('ht-levelup');

    // Restart countdown with new expiry
    _startHypeTrainCountdown(train);
}

// ── End ───────────────────────────────────────────────────────────────────────
function _endHypeTrain(train) {
    if (!_htEl) return;
    _updateHypeTrain(train, false);

    const progress = train.progress ?? train;
    const level    = progress.level ?? train.level ?? 1;
    const lvlEl    = _htEl.querySelector('.ht-level-num');
    if (lvlEl) lvlEl.textContent = level;

    _htEl.classList.add('ht-ended');

    const timer = _htEl.querySelector('.ht-timer');
    if (timer) timer.textContent = 'Ended';
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function _startHypeTrainCountdown(train) {
    if (_htCountdownId) clearInterval(_htCountdownId);

    // expires_at is an ISO timestamp in the event data
    const progress  = train.progress ?? train;
    const expiresAt = progress.expires_at
        ? new Date(progress.expires_at).getTime()
        : train.expires_at
        ? new Date(train.expires_at).getTime()
        : Date.now() + 300_000; // 5min fallback

    function tick() {
        if (!_htEl) return;
        const timer    = _htEl.querySelector('.ht-timer');
        if (!timer) return;
        const secsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        timer.textContent = secsLeft > 0 ? `${secsLeft}s` : 'Ending…';
        if (secsLeft <= 0) { clearInterval(_htCountdownId); _htCountdownId = null; }
    }

    tick();
    _htCountdownId = setInterval(tick, 1000);
}

// ── Dismiss ───────────────────────────────────────────────────────────────────
function _scheduleHypeTrainDismiss() {
    if (_htFadeId) clearTimeout(_htFadeId);
    _htFadeId = setTimeout(() => {
        if (!_htEl) return;
        _htEl.classList.add('ht-fading');
        setTimeout(() => _clearHypeTrain(), 600);
    }, CONFIG.hypeTrainLingerMs ?? 6000);
}

function _clearHypeTrain() {
    if (_htFadeId)      { clearTimeout(_htFadeId);       _htFadeId      = null; }
    if (_htCountdownId) { clearInterval(_htCountdownId); _htCountdownId = null; }
    if (_htEl)          { _htEl.remove(); _htEl = null; }
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function _buildHypeTrainHTML(train) {
    const progress = train.progress ?? train;
    const value    = progress.value ?? 0;
    const goal     = progress.goal  ?? 1;
    const level    = progress.level ?? train.level ?? 1;
    const pct      = Math.min(100, Math.round((value / goal) * 100));

    return `
        <div class="ht-left">
            <svg class="ht-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 16c0 1.1.9 2 2 2h1v1a1 1 0 002 0v-1h6v1a1 1 0 002 0v-1h1c1.1 0 2-.9 2-2V8H4v8zM7 9.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm10 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM15.5 3l1.5 2H7L8.5 3h7z"/>
                <path d="M20 6h-1.18C18.4 4.84 17.3 4 16 4H8C6.7 4 5.6 4.84 5.18 6H4c-1.1 0-2 .9-2 2v1c0 .55.45 1 1 1h1v6c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-6h1c.55 0 1-.45 1-1V8c0-1.1-.9-2-2-2z" opacity=".3"/>
            </svg>
            <span class="ht-label">Hype Train</span>
        </div>
        <div class="ht-level">
            <span class="ht-level-label">LVL</span>
            <span class="ht-level-num">${level}</span>
        </div>
        <div class="ht-bar-section">
            <div class="ht-bar-track">
                <div class="ht-bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="ht-pts">${_fmtPts(value)} / ${_fmtPts(goal)}</div>
        </div>
        <div class="ht-timer">…</div>`;
}

function _fmtPts(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}