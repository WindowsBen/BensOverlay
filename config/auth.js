// ─── config/auth.js ───────────────────────────────────────────────────────────
// Twitch OAuth implicit flow for the configurator page.
// On login, Twitch redirects back with an access_token in the URL hash.
// The token is stored in localStorage so it persists across sessions and
// can be automatically embedded in the generated OBS URL.

const CLIENT_ID = 'ti9ahr6lkym6anpij3d4f2cyjhij18';

// Redirects to Twitch's OAuth page — on return, handleOAuthRedirect() picks up the token
function loginWithTwitch() {
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id',     CLIENT_ID);
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope',         'user:read:chat channel:read:redemptions');
    window.location.href = authUrl.toString();
}

// Updates the UI to show the logged-in state and unlocks all tabs
function setLoggedIn() {
    document.getElementById('status-dot').className     = 'dot dot-green';
    document.getElementById('status-text').textContent  = 'Connected ✓';
    document.getElementById('auth-btn').style.display   = 'none';
    document.getElementById('reauth-btn').style.display = 'inline-flex';
    const badge = document.getElementById('login-badge');
    badge.textContent = 'Connected';
    badge.classList.remove('locked-badge');
    unlockTabs(); // defined in ui.js
}

// Fetches the logged-in user's Twitch login/display name and pre-fills the channel field
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

// Checks if Twitch just redirected back with a token in the URL hash.
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

window.addEventListener('load', async () => {
    const freshLogin = handleOAuthRedirect();
    // ui.js lockTabs() runs first via its own load listener

    const token = localStorage.getItem('twitch_access_token');
    if (token) {
        setLoggedIn();
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