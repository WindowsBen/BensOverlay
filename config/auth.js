// ─── config/auth.js ───────────────────────────────────────────────────────────

const CLIENT_ID = 'ti9ahr6lkym6anpij3d4f2cyjhij18';

function loginWithTwitch() {
    // Hardcoded rather than window.location.origin + pathname because GitHub Pages
    // sometimes serves index.html under both / and /index.html, causing the dynamic
    // URI to alternate between the two and produce a redirect_mismatch error from
    // Twitch when the value at click time differs from the value Twitch expects.
    const redirectUri = 'https://yacofo.chat/';
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

function setExpired() {
    document.getElementById('status-dot').className     = 'dot dot-amber';
    document.getElementById('status-text').textContent  = 'Token expired — re-authenticate to restore overlay';
    document.getElementById('auth-btn').style.display   = 'none';
    document.getElementById('reauth-btn').style.display = 'inline-flex';
    document.getElementById('reauth-btn').textContent   = 'Re-authenticate';
    const badge = document.getElementById('login-badge');
    badge.textContent = 'Token expired';
    badge.classList.add('locked-badge');

    // Show prominent expired banner below the auth row
    if (!document.getElementById('token-expired-banner')) {
        const banner = document.createElement('div');
        banner.id        = 'token-expired-banner';
        banner.className = 'token-expired-banner';
        banner.innerHTML = `
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            <div>
                <strong>Your Twitch token has expired.</strong><br>
                Click Re-authenticate below to get a new one — your overlay URL stays the same,
                just refresh the browser source in OBS after logging in.
                <br><button class="btn-reauth" onclick="loginWithTwitch()">Re-authenticate</button>
            </div>`;
        // Insert after the auth accordion section
        const authAccordion = document.querySelector('.auth-accordion') || document.querySelector('.accordion');
        if (authAccordion) authAccordion.after(banner);
    }
}

// Validates the stored token against Helix. Returns true if valid, false if expired/invalid.
// Called on page load so users immediately see if their token has lapsed.
async function validateToken(token) {
    try {
        const res = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': CLIENT_ID }
        });
        if (res.status === 401) {
            // Token definitely expired or revoked
            localStorage.removeItem('twitch_access_token');
            localStorage.removeItem('twitch_username');
            setExpired();
            return false;
        }
        return res.ok;
    } catch {
        // Network error — don't mark as expired, just leave as-is
        return true;
    }
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
        // Validate the stored token before marking as logged in.
        // For fresh logins the token was just issued so we skip the roundtrip.
        if (freshLogin) {
            setLoggedIn();
            await fetchAndStoreUsername(token);
        } else {
            const valid = await validateToken(token);
            if (valid) {
                setLoggedIn();
                const username = localStorage.getItem('twitch_username');
                if (username) {
                    document.getElementById('channel').value           = username;
                    document.getElementById('login-badge').textContent = username;
                    document.getElementById('status-text').textContent = `Connected as ${username} ✓`;
                }
            }
            // If invalid, setExpired() was already called inside validateToken()
        }
    }
});