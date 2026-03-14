// ─── config/ui.js ─────────────────────────────────────────────────────────────

const TABS = ['general', 'events', 'polls', 'predictions', 'hypetrain', 'appearance', 'generate', 'vod'];

function switchTab(id) {
    TABS.forEach(t => {
        document.getElementById(`tab-${t}`).classList.remove('active');
        document.getElementById(`tab-btn-${t}`).classList.remove('active');
    });
    document.getElementById(`tab-${id}`).classList.add('active');
    document.getElementById(`tab-btn-${id}`).classList.add('active');
}

function unlockTabs() {
    TABS.forEach(t => {
        document.getElementById(`tab-btn-${t}`).classList.remove('locked');
        document.getElementById(`tab-${t}`).classList.remove('tab-locked');
    });
    switchTab('general');
}

function lockTabs() {
    TABS.forEach(t => {
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