// ─── config/auth.js ───────────────────────────────────────────────────────────

const CLIENT_ID = 'ti9ahr6lkym6anpij3d4f2cyjhij18';

function loginWithTwitch() {
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id',     CLIENT_ID);
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope',         'user:read:chat channel:read:redemptions channel:read:hype_train channel:read:polls channel:read:predictions');
    window.location.href = authUrl.toString();
}

function setLoggedIn() {
    document.getElementById('status-dot').className     = 'dot dot-green';
    document.getElementById('status-text').textContent  = 'Connected ✓';
    document.getElementById('auth-btn').style.display   = 'none';
    document.getElementById('reauth-btn').style.display = 'inline-flex';
    const badge = document.getElementById('login-badge');
    badge.textContent = 'Connected';
    badge.classList.remove('locked-badge');
    unlockTabs(); // ui.js
}

async function fetchAndStoreUsername(token) {
    try {
        const res = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': CLIENT_ID }
        });
        if (!res.ok) return;
        const data = await res.json();
        const user = data.data?.[0];
        if (!user) return;
        localStorage.setItem('twitch_username', user.login);
        document.getElementById('channel').value           = user.login;
        document.getElementById('login-badge').textContent = user.display_name;
        document.getElementById('status-text').textContent = `Connected as ${user.display_name} ✓`;
    } catch { /* silent */ }
}

function handleOAuthRedirect() {
    const hash = window.location.hash;
    if (!hash) return false;
    const p     = new URLSearchParams(hash.slice(1));
    const token = p.get('access_token');
    if (!token) return false;
    localStorage.setItem('twitch_access_token', token);
    localStorage.removeItem('twitch_username');
    history.replaceState(null, '', window.location.pathname);
    return true;
}

// Single init entry point — no competing load listeners
window.addEventListener('load', async () => {
    // 1. Lock everything first, synchronously
    lockTabs();
    initSliders();

    // 2. Then check auth and unlock if valid
    const freshLogin = handleOAuthRedirect();
    const token      = localStorage.getItem('twitch_access_token');

    if (token) {
        setLoggedIn(); // calls unlockTabs()
        if (freshLogin) {
            await fetchAndStoreUsername(token);
        } else {
            const username = localStorage.getItem('twitch_username');
            if (username) {
                document.getElementById('channel').value           = username;
                document.getElementById('login-badge').textContent = username;
                document.getElementById('status-text').textContent = `Connected as ${username} ✓`;
            }
        }
    }
});