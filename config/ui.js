// ─── config/ui.js ─────────────────────────────────────────────────────────────
// All interactive UI behaviour on the configurator page.

const TABS         = ['general', 'events', 'appearance', 'generate'];
const LOCKED_TABS  = ['events', 'appearance', 'generate']; // require login

// Switches to the given tab. Locked tabs are ignored.
function switchTab(id) {
    const btn = document.getElementById(`tab-btn-${id}`);
    if (btn.classList.contains('locked')) return;

    TABS.forEach(t => {
        document.getElementById(`tab-${t}`).classList.remove('active');
        document.getElementById(`tab-btn-${t}`).classList.remove('active');
    });

    document.getElementById(`tab-${id}`).classList.add('active');
    btn.classList.add('active');
}

// Unlocks all tabs and activates General by default.
// Called by auth.js after a successful login.
function unlockTabs() {
    LOCKED_TABS.forEach(t => document.getElementById(`tab-btn-${t}`).classList.remove('locked'));
    switchTab('general');
}

// Locks restricted tabs and shows General (always available before login).
function lockTabs() {
    LOCKED_TABS.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        btn.classList.add('locked');
        btn.classList.remove('active');
        document.getElementById(`tab-${t}`).classList.remove('active');
    });
    switchTab('general');
}

// Shows or hides the color/label options panel for an event type.
function toggleEventOptions(checkboxId, optionsId) {
    const checked = document.getElementById(checkboxId).checked;
    document.getElementById(optionsId).classList.toggle('visible', checked);
}

// When "Disable ALL badges" is checked, grey out and uncheck dependent options.
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

// Wire up opacity sliders so labels update live as you drag.
window.addEventListener('load', () => {
    lockTabs();
    document.querySelectorAll('.opacity-slider').forEach(slider => {
        const label = document.getElementById(slider.id + 'Label');
        if (label) slider.addEventListener('input', () => { label.textContent = slider.value + '%'; });
    });
});