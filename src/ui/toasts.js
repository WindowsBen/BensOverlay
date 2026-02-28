// ─── ui/toasts.js ─────────────────────────────────────────────────────────────
// Toast notifications for 7TV emote set changes.

function showNewEmoteToast(emoteName, emoteUrl) {
    const toast = document.createElement('div');
    toast.className = 'emote-toast';
    toast.innerHTML = `
        New Emote added to Set: <strong>${escapeHTML(emoteName)}</strong>
        <img class="toast-emote" src="${escapeHTML(emoteUrl)}" alt="${escapeHTML(emoteName)}">
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('emote-toast--visible')));
    setTimeout(() => {
        toast.classList.remove('emote-toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
}

function showRemovedEmoteToast(emoteName, emoteUrl) {
    const toast = document.createElement('div');
    toast.className = 'emote-toast emote-toast--removed';
    toast.innerHTML = `
        Emote removed from Set: <strong>${escapeHTML(emoteName)}</strong>
        ${emoteUrl ? `<img class="toast-emote" src="${escapeHTML(emoteUrl)}" alt="${escapeHTML(emoteName)}">` : ''}
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('emote-toast--visible')));
    setTimeout(() => {
        toast.classList.remove('emote-toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
}