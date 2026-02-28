// ─── utils.js ─────────────────────────────────────────────────────────────────
// Shared utility functions used across the project.

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}