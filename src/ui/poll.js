// ─── ui/poll.js ───────────────────────────────────────────────────────────────
// Renders a persistent poll widget in the center of the overlay.
// Subscribes to polls.<channelId> via PubSub.
//
// States handled:
//   poll-created   — widget appears with title and choices, no votes yet
//   poll-updated   — live vote counts and progress bars animate in
//   poll-completed — winning choice highlighted, widget lingers then fades out
//
// Only one poll can be active at a time. If a new one arrives while one is
// visible the old widget is replaced immediately.

let _pollEl     = null;  // current widget DOM element, or null
let _pollFadeId      = null;  // setTimeout ID for the post-completion fade
let _pollCountdownId = null;  // setInterval ID for the live countdown

// Entry point called from pubsub.js when a polls.<channelId> message arrives
function handlePubSubPoll(data) {
    if (!CONFIG.showPolls) return;

    let inner;
    try { inner = JSON.parse(data.message); } catch (e) { console.error('[Poll] parse error', e); return; }

    const type = inner.type;
    const poll = inner.data?.poll;
    if (!poll) return;

    if (type === 'POLL_CREATE') {
        _showPoll(poll, false);
    } else if (type === 'POLL_UPDATE') {
        // If a widget already exists update it in place, otherwise create it
        if (_pollEl) {
            _updatePollBars(poll, false);
            // Restart countdown in case ended_at was just provided in this update
            if (!_pollCountdownId) _startCountdown(poll);
        } else {
            _showPoll(poll, false);
        }
    } else if (type === 'POLL_COMPLETE' || type === 'POLL_TERMINATE') {
        if (_pollCountdownId) { clearInterval(_pollCountdownId); _pollCountdownId = null; }
        if (_pollEl) {
            _updatePollBars(poll, true);
            _schedulePollDismiss();
        } else {
            _showPoll(poll, true);
            _schedulePollDismiss();
        }
    }
}

// Creates and mounts the poll widget from scratch
function _showPoll(poll, completed) {
    _clearPoll();

    const el = document.createElement('div');
    el.className = 'poll-widget';
    el.innerHTML = _buildPollHTML(poll, completed);
    document.getElementById('poll-overlay').appendChild(el);
    _pollEl = el;

    // Trigger fade-in on next frame
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('poll-visible')));

    // Start live countdown if poll is still running
    if (!completed) _startCountdown(poll);
}

// Starts a 1-second interval updating the footer countdown.
// Uses ended_at timestamp if available, otherwise falls back to duration_seconds.
function _startCountdown(poll) {
    if (_pollCountdownId) clearInterval(_pollCountdownId);

    const endTime = poll.ended_at ? new Date(poll.ended_at).getTime()
                  : poll.ends_at  ? new Date(poll.ends_at).getTime()
                  : Date.now() + ((poll.duration_seconds ?? poll.duration ?? 0) * 1000);

    function tick() {
        if (!_pollEl) return;
        const footer = _pollEl.querySelector('.poll-footer');
        if (!footer) return;
        const secsLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        footer.textContent = secsLeft > 0 ? `${secsLeft}s` : 'Ending…';
        if (secsLeft <= 0) {
            clearInterval(_pollCountdownId);
            _pollCountdownId = null;
        }
    }

    tick(); // run immediately so there's no 1s delay on first render
    _pollCountdownId = setInterval(tick, 1000);
}

// Updates vote bars and counts on the existing widget element
function _updatePollBars(poll, completed) {
    if (!_pollEl) return;

    const choices  = poll.choices || [];
    const totalVotes = choices.reduce((sum, c) => sum + _choiceVotes(c), 0);
    const maxVotes   = Math.max(...choices.map(c => _choiceVotes(c)), 1);

    choices.forEach((choice, i) => {
        const row = _pollEl.querySelector(`[data-choice-index="${i}"]`);
        if (!row) return;

        const votes   = _choiceVotes(choice);
        const pct     = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const barFill = row.querySelector('.poll-bar-fill');
        const countEl = row.querySelector('.poll-vote-count');
        const pctEl   = row.querySelector('.poll-vote-pct');

        if (barFill) barFill.style.width = `${pct}%`;
        if (countEl) countEl.textContent = votes.toLocaleString();
        if (pctEl)   pctEl.textContent   = `${pct}%`;

        // Highlight winner on completion
        if (completed && votes === maxVotes && totalVotes > 0) {
            row.classList.add('poll-winner');
        }
    });

    if (completed) {
        _pollEl.classList.add('poll-completed');
        const footer = _pollEl.querySelector('.poll-footer');
        if (footer) footer.textContent = 'Poll ended';
    }
}

// Fades out and removes the widget after a delay post-completion
function _schedulePollDismiss() {
    if (_pollFadeId) clearTimeout(_pollFadeId);
    // Linger for CONFIG.pollLingerMs (default 6000ms) then fade
    _pollFadeId = setTimeout(() => {
        if (!_pollEl) return;
        _pollEl.classList.add('poll-fading');
        // Remove after fade transition completes
        setTimeout(() => _clearPoll(), 700);
    }, CONFIG.pollLingerMs ?? 6000);
}

// Removes the widget from the DOM immediately (no animation)
function _clearPoll() {
    if (_pollFadeId)      { clearTimeout(_pollFadeId);       _pollFadeId      = null; }
    if (_pollCountdownId) { clearInterval(_pollCountdownId); _pollCountdownId = null; }
    if (_pollEl)          { _pollEl.remove(); _pollEl = null; }
}

// Returns total votes for a choice (bits + channel points combined)
function _choiceVotes(choice) {
    return (choice.votes?.total ?? 0)
        || (choice.total_votes ?? 0);
}

// Builds the full inner HTML for a poll widget
function _buildPollHTML(poll, completed) {
    const choices    = poll.choices || [];
    const totalVotes = choices.reduce((sum, c) => sum + _choiceVotes(c), 0);
    const maxVotes   = Math.max(...choices.map(c => _choiceVotes(c)), 1);

    const choicesHTML = choices.map((choice, i) => {
        const votes = _choiceVotes(choice);
        const pct   = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isWinner = completed && votes === maxVotes && totalVotes > 0;
        return `
            <div class="poll-choice${isWinner ? ' poll-winner' : ''}" data-choice-index="${i}">
                <div class="poll-choice-header">
                    <span class="poll-choice-label">${escapeHTML(choice.title)}</span>
                    <span class="poll-vote-pct">${pct}%</span>
                </div>
                <div class="poll-bar-track">
                    <div class="poll-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="poll-vote-count">${votes.toLocaleString()}</div>
            </div>`;
    }).join('');

    const footerText = completed ? 'Poll ended' : '…';

    return `
        <div class="poll-header">
            <span class="poll-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                </svg>
            </span>
            <span class="poll-title">${escapeHTML(poll.title)}</span>
        </div>
        <div class="poll-choices">${choicesHTML}</div>
        ${footerText ? `<div class="poll-footer">${footerText}</div>` : ''}`;
}