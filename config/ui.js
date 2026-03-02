// ─── config/ui.js ─────────────────────────────────────────────────────────────
// Handles all interactive UI behaviour on the configurator page.

// ── Accordion open/close ──────────────────────────────────────────────────────
function toggleAccordion(id) {
    const el = document.getElementById(id);
    if (el.classList.contains('locked')) return;
    el.classList.toggle('open');
}

// ── Event type color panel expand/collapse ────────────────────────────────────
function toggleEventOptions(checkboxId, optionsId) {
    const checked = document.getElementById(checkboxId).checked;
    document.getElementById(optionsId).classList.toggle('visible', checked);
}

// ── Badge "Disable ALL" greys out dependent checkboxes ───────────────────────
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

// ── Opacity sliders → live percentage labels ──────────────────────────────────
window.addEventListener('load', () => {
    document.querySelectorAll('.opacity-slider').forEach(slider => {
        const label = document.getElementById(slider.id + 'Label');
        if (label) slider.addEventListener('input', () => { label.textContent = slider.value + '%'; });
    });
});