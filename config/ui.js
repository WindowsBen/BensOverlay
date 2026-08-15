// ─── config/ui.js ─────────────────────────────────────────────────────────────

// VOD Export tab is temporarily hidden (not public-ready yet) — its button
// carries display:none in index.html and it's intentionally left out of
// these arrays so it's never switched to, locked, or unlocked. The markup
// and config/vod.js are untouched; just re-add 'vod' here (and remove the
// display:none on tab-btn-vod) to bring it back.
const TABS        = ['general', 'events', 'polls', 'predictions', 'hypetrain', 'appearance', 'generate'];
const LOCKED_TABS = ['general', 'events', 'polls', 'predictions', 'hypetrain', 'appearance', 'generate'];

function switchTab(id) {
    TABS.forEach(t => {
        document.getElementById(`tab-${t}`).classList.remove('active');
        document.getElementById(`tab-btn-${t}`).classList.remove('active');
    });
    document.getElementById(`tab-${id}`).classList.add('active');
    document.getElementById(`tab-btn-${id}`).classList.add('active');
}

function unlockTabs() {
    LOCKED_TABS.forEach(t => {
        document.getElementById(`tab-btn-${t}`).classList.remove('locked');
        document.getElementById(`tab-${t}`).classList.remove('tab-locked');
    });
    switchTab('general');
}

function lockTabs() {
    LOCKED_TABS.forEach(t => {
        document.getElementById(`tab-btn-${t}`).classList.add('locked');
        document.getElementById(`tab-btn-${t}`).classList.remove('active');
        document.getElementById(`tab-${t}`).classList.add('tab-locked');
        document.getElementById(`tab-${t}`).classList.remove('active');
    });
    // Show General as a blurred preview so the user knows they need to log in
    document.getElementById('tab-general').classList.add('active');
    document.getElementById('tab-btn-general').classList.add('active');
}

function toggleEventOptions(checkboxId, optionsId) {
    const checked = document.getElementById(checkboxId).checked;
    document.getElementById(optionsId).classList.toggle('visible', checked);
}


// Wire up opacity slider labels — called by auth.js after DOM is ready
function initSliders() {
    document.querySelectorAll('.opacity-slider').forEach(slider => {
        const label = document.getElementById(slider.id + 'Label');
        if (label) slider.addEventListener('input', () => { label.textContent = slider.value + '%'; });
    });



    // Generate tab blink — pulses the Generate tab and button when any setting changes
    // so the user knows they need to regenerate their link.
    function _blinkGenerate() {
        const tabBtn    = document.getElementById('tab-btn-generate');
        const genBtn    = document.querySelector('.btn-generate');
        [tabBtn, genBtn].forEach(el => {
            if (!el) return;
            // Remove class first to restart animation if already running
            el.classList.remove('needs-regen');
            void el.offsetWidth; // reflow
            el.classList.add('needs-regen');
            el.addEventListener('animationend', () => el.classList.remove('needs-regen'), { once: true });
        });
    }

    document.addEventListener('input',  _blinkGenerate);
    document.addEventListener('change', _blinkGenerate);
}

// ── Shadow direction dial ────────────────────────────────────────────────────
// A small draggable/clickable compass control for the text-shadow angle.
// Convention: 0° = up (12 o'clock), increasing clockwise — matches how a
// compass or clock face reads, which is the most intuitive mapping for a
// circular direction picker. The actual value lives in the hidden #shadowAngle
// input; this function only keeps the visible handle in sync with it and
// dispatches a real 'input' event so everything else (live preview, the
// "needs regen" blink, generate.js) reacts exactly like any other field.
function initShadowAngleDial() {
    const dial   = document.getElementById('shadowAngleDial');
    const handle = document.getElementById('shadowAngleHandle');
    const input  = document.getElementById('shadowAngle');
    if (!dial || !handle || !input) return;

    const HANDLE_RADIUS = 20; // px from dial center to handle track

    function paint(angle) {
        const rad = angle * Math.PI / 180;
        const cx  = dial.clientWidth  / 2;
        const cy  = dial.clientHeight / 2;
        handle.style.left = `${cx + HANDLE_RADIUS * Math.sin(rad)}px`;
        handle.style.top  = `${cy - HANDLE_RADIUS * Math.cos(rad)}px`;
        dial.setAttribute('aria-valuenow', Math.round(angle));
    }

    function setAngle(angle) {
        angle = Math.round(((angle % 360) + 360) % 360);
        input.value = angle;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        paint(angle);
    }

    function angleFromPointer(clientX, clientY) {
        const rect = dial.getBoundingClientRect();
        const dx = clientX - (rect.left + rect.width  / 2);
        const dy = clientY - (rect.top  + rect.height / 2);
        // atan2(x, -y) measures clockwise from "up" — exactly our angle convention
        return Math.atan2(dx, -dy) * 180 / Math.PI;
    }

    let dragging = false;
    dial.addEventListener('pointerdown', (e) => {
        dragging = true;
        dial.setPointerCapture(e.pointerId);
        setAngle(angleFromPointer(e.clientX, e.clientY));
    });
    dial.addEventListener('pointermove', (e) => {
        if (dragging) setAngle(angleFromPointer(e.clientX, e.clientY));
    });
    dial.addEventListener('pointerup',     () => { dragging = false; });
    dial.addEventListener('pointercancel', () => { dragging = false; });

    // Keyboard accessibility — arrow keys nudge the angle in 5° steps
    dial.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        setAngle((parseInt(input.value) || 0) + step);
    });

    // Keep the visible handle in sync with the underlying value regardless of
    // what changed it — dragging the dial, arrow keys, or importConfig()
    // restoring a saved setting all end up setting input.value + firing 'input'.
    input.addEventListener('input', () => paint(parseInt(input.value) || 0));

    paint(parseInt(input.value) || 0);
}
document.addEventListener('DOMContentLoaded', initShadowAngleDial);