// ─── ui/prediction.js ─────────────────────────────────────────────────────────
// Renders a persistent prediction widget in the center of the overlay.
// Subscribes to predictions-channel-v1.<channelId> via PubSub.
//
// States handled:
//   event-created  — widget appears with title and two outcomes
//   event-updated  — live point totals and odds bars animate
//   event-locked   — betting closes, countdown replaced with "Locked"
//   event-resolved — winning outcome highlighted, gains shown, animation plays
//   event-canceled — widget dismissed quietly

let _predEl          = null;  // current widget DOM element
let _predFadeId      = null;  // setTimeout for post-resolution dismiss
let _predCountdownId = null;  // setInterval for betting window countdown

// Palette of up to 10 distinct colors for prediction outcomes.
// Twitch only sends BLUE/PINK for 2-outcome predictions; for 3+ we assign
// colors by index so every outcome always gets a distinct, readable color.
const PRED_COLORS = [
    '#5B9BD5',  // 0 blue
    '#E91E8C',  // 1 pink
    '#43B581',  // 2 green
    '#FAA61A',  // 3 orange
    '#9B59B6',  // 4 purple
    '#E74C3C',  // 5 red
    '#1ABC9C',  // 6 teal
    '#F39C12',  // 7 amber
    '#3498DB',  // 8 light blue
    '#E67E22',  // 9 warm orange
];

// ── Entry point ───────────────────────────────────────────────────────────────
function handlePubSubPrediction(data) {
    if (!CONFIG.showPredictions) return;

    let inner;
    try { inner = JSON.parse(data.message); } catch { return; }

    const type       = inner.type;
    const prediction = inner.data?.event;
    if (!prediction) return;

    // Twitch sends everything as event-updated with a status field.
    // Separate event-locked / event-canceled types don't fire in practice.
    const status = prediction.status ?? '';

    if (type === 'event-created' || (type === 'event-updated' && status === 'ACTIVE')) {
        // Prediction open — create or update live bars
        if (_predEl) {
            _updatePredictionBars(prediction, 'open');
            if (!_predCountdownId) _startPredictionCountdown(prediction);
        } else {
            _showPrediction(prediction, 'open');
        }

    } else if (status === 'LOCKED' || type === 'event-locked') {
        // Betting closed — stop countdown, show lock badge, then dismiss after linger
        if (_predCountdownId) { clearInterval(_predCountdownId); _predCountdownId = null; }
        if (_predEl) {
            _updatePredictionBars(prediction, 'locked');
        } else {
            _showPrediction(prediction, 'locked');
        }
        _schedulePredictionDismiss();

    } else if (status === 'RESOLVED' || type === 'event-resolved') {
        if (_predCountdownId) { clearInterval(_predCountdownId); _predCountdownId = null; }
        if (_predEl) {
            _resolvePrediction(prediction);
        } else {
            _showPrediction(prediction, 'resolved');
            setTimeout(() => _resolvePrediction(prediction), 100);
        }
        _schedulePredictionDismiss();

    } else if (status === 'CANCELED' || status === 'CANCEL_PENDING' || type === 'event-canceled') {
        if (_predCountdownId) { clearInterval(_predCountdownId); _predCountdownId = null; }
        // CANCEL_PENDING lingers until CANCELED confirms, then dismiss after linger time
        if (status === 'CANCELED') {
            _schedulePredictionDismiss();
        }
    }
}

// ── Widget creation ───────────────────────────────────────────────────────────
function _showPrediction(prediction, status) {
    _clearPrediction();

    const el = document.createElement('div');
    el.className = 'prediction-widget';
    el.innerHTML = _buildPredictionHTML(prediction, status);
    document.getElementById('prediction-overlay').appendChild(el);
    _predEl = el;

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('prediction-visible')));

    if (status === 'open') _startPredictionCountdown(prediction);
}

// ── Bar / odds update ─────────────────────────────────────────────────────────
function _updatePredictionBars(prediction, status) {
    if (!_predEl) return;

    const outcomes   = prediction.outcomes || [];
    const totalPts   = outcomes.reduce((s, o) => s + (o.total_points || 0), 0);

    outcomes.forEach((outcome, i) => {
        const row = _predEl.querySelector(`[data-outcome-index="${i}"]`);
        if (!row) return;

        const pts    = outcome.total_points || 0;
        const users  = outcome.total_users  || 0;
        const pct    = totalPts > 0 ? Math.round((pts / totalPts) * 100) : 50;
        // Multiplier: if you bet on this side and win, you get (totalPts / pts) per point
        const mult   = pts > 0 ? (totalPts / pts).toFixed(1) : '–';

        const bar    = row.querySelector('.prediction-bar-fill');
        const ptsEl  = row.querySelector('.prediction-pts');
        const usersEl = row.querySelector('.prediction-users');
        const multEl = row.querySelector('.prediction-mult');

        if (bar)     bar.style.width     = `${pct}%`;
        if (ptsEl)   ptsEl.textContent   = _formatPts(pts);
        if (usersEl) usersEl.textContent = `${users.toLocaleString()} predictors`;
        if (multEl)  multEl.textContent  = `${mult}x`;
    });

    // Update status badge
    const badge = _predEl.querySelector('.prediction-status');
    if (badge) {
        if (status === 'locked') {
            badge.textContent = '🔒 Locked';
            badge.classList.add('locked');
            if (_predCountdownId) { clearInterval(_predCountdownId); _predCountdownId = null; }
        }
    }
}

// ── Resolution ────────────────────────────────────────────────────────────────
function _resolvePrediction(prediction) {
    if (!_predEl) return;

    const outcomes   = prediction.outcomes || [];
    const winnerId   = prediction.winning_outcome_id;
    const totalPts   = outcomes.reduce((s, o) => s + (o.total_points || 0), 0);
    const winOutcome = outcomes.find(o => o.id === winnerId);
    const winPts     = winOutcome?.total_points || 0;
    const multiplier = winPts > 0 ? (totalPts / winPts).toFixed(2) : '1.00';

    outcomes.forEach((outcome, i) => {
        const row = _predEl.querySelector(`[data-outcome-index="${i}"]`);
        if (!row) return;
        if (outcome.id === winnerId) {
            row.classList.add('prediction-winner');
        } else {
            row.classList.add('prediction-loser');
        }
    });

    // Swap the footer to show result info
    const footer = _predEl.querySelector('.prediction-footer');
    if (footer && winOutcome) {
        footer.innerHTML = `
            <span class="pred-result-label">Winner:</span>
            <span class="pred-result-name">${escapeHTML(winOutcome.title)}</span>
            <span class="pred-result-mult">${multiplier}x return</span>`;
        footer.classList.add('pred-resolved-footer');
    }

    // Play the resolution animation on the widget
    _predEl.classList.add('prediction-resolving');
    setTimeout(() => _predEl?.classList.remove('prediction-resolving'), 1000);
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function _startPredictionCountdown(prediction) {
    if (_predCountdownId) clearInterval(_predCountdownId);

    // predictions_window_seconds from creation time
    const window    = prediction.prediction_window_seconds ?? prediction.prediction_window ?? 0;
    const createdAt = prediction.created_at ? new Date(prediction.created_at).getTime() : Date.now();
    const endTime   = prediction.locked_at  ? new Date(prediction.locked_at).getTime()
                    : createdAt + (window * 1000);

    function tick() {
        if (!_predEl) return;
        const badge    = _predEl.querySelector('.prediction-status');
        if (!badge) return;
        const secsLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        badge.textContent = secsLeft > 0 ? `${secsLeft}s to predict` : 'Locking…';
        if (secsLeft <= 0) { clearInterval(_predCountdownId); _predCountdownId = null; }
    }

    tick();
    _predCountdownId = setInterval(tick, 1000);
}

// ── Dismiss ───────────────────────────────────────────────────────────────────
function _schedulePredictionDismiss() {
    if (_predFadeId) clearTimeout(_predFadeId);
    _predFadeId = setTimeout(() => {
        if (!_predEl) return;
        _predEl.classList.add('prediction-fading');
        setTimeout(() => _clearPrediction(), 700);
    }, CONFIG.predictionLingerMs ?? 8000);
}

function _clearPrediction() {
    if (_predFadeId)      { clearTimeout(_predFadeId);       _predFadeId      = null; }
    if (_predCountdownId) { clearInterval(_predCountdownId); _predCountdownId = null; }
    if (_predEl)          { _predEl.remove(); _predEl = null; }
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function _buildPredictionHTML(prediction, status) {
    const outcomes = prediction.outcomes || [];
    const totalPts = outcomes.reduce((s, o) => s + (o.total_points || 0), 0);

    const outcomesHTML = outcomes.map((outcome, i) => {
        const pts   = outcome.total_points || 0;
        const users = outcome.total_users  || 0;
        const pct   = totalPts > 0 ? Math.round((pts / totalPts) * 100) : 50;
        const mult  = pts > 0 ? (totalPts / pts).toFixed(1) : '–';
        const colorClass = `outcome-color-${i % PRED_COLORS.length}`;

        return `
            <div class="prediction-outcome ${colorClass}" data-outcome-index="${i}">
                <div class="prediction-outcome-header">
                    <span class="prediction-outcome-title">${escapeHTML(outcome.title)}</span>
                    <span class="prediction-mult">${mult}x</span>
                </div>
                <div class="prediction-bar-track">
                    <div class="prediction-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="prediction-outcome-stats">
                    <span class="prediction-pts">${_formatPts(pts)}</span>
                    <span class="prediction-users">${users.toLocaleString()} predictors</span>
                </div>
            </div>`;
    }).join('');

    const statusText = status === 'locked' ? '🔒 Locked' : '…';

    return `
        <div class="prediction-header">
            <span class="prediction-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 2a6 6 0 110 12A6 6 0 0110 4zm1 3H9v5l4 2.5.8-1.3-3-1.8V7z"/>
                </svg>
            </span>
            <span class="prediction-title">${escapeHTML(prediction.title)}</span>
        </div>
        <div class="prediction-outcomes">${outcomesHTML}</div>
        <div class="prediction-footer">
            <span class="prediction-status${status === 'locked' ? ' locked' : ''}">${statusText}</span>
            <span class="prediction-total">${_formatPts(totalPts)} points wagered</span>
        </div>`;
}

// Formats a large point number compactly: 1200 → "1.2K", 1500000 → "1.5M"
function _formatPts(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}