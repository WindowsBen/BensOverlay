// ─── config/ui.js ─────────────────────────────────────────────────────────────

const TABS = ['general', 'events', 'polls', 'predictions', 'hypetrain', 'appearance', 'generate'];

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

function onDisableAllBadgesChange() {
    const disabled = document.getElementById('disableAllBadges').checked;
    ['roleOnlyBadges', 'showExternalCosmetics'].forEach(id => {
        const wrapper = document.getElementById(id).closest('.checkbox-wrapper');
        if (disabled) {
            document.getElementById(id).checked = false;
            wrapper.style.opacity       = '0.35';
            wrapper.style.pointerEvents = 'none';
        } else {
            wrapper.style.opacity       = '';
            wrapper.style.pointerEvents = '';
        }
    });
}

// Wire up opacity slider labels — called by auth.js after DOM is ready
function initSliders() {
    document.querySelectorAll('.opacity-slider').forEach(slider => {
        const label = document.getElementById(slider.id + 'Label');
        if (label) slider.addEventListener('input', () => { label.textContent = slider.value + '%'; });
    });
}