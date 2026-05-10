// ─── config/auth.js ───────────────────────────────────────────────────────────

const CLIENT_ID = 'ti9ahr6lkym6anpij3d4f2cyjhij18';

function loginWithTwitch() {
    console.log('[Auth] loginWithTwitch called');
    const redirectUri = 'https://yacofo.chat/index.html';
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id',     CLIENT_ID);
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope',         'user:read:chat channel:read:redemptions channel:read:hype_train channel:read:polls channel:read:predictions');
    console.log('[Auth] redirecting to:', authUrl.toString());
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

// Validates the stored token against Helix. Called in the background after
// setLoggedIn() so it never blocks the UI. Shows the expired banner on 401.
async function validateToken(token) {
    try {
        const res = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': CLIENT_ID }
        });
        if (res.status === 401) {
            // Token is expired or revoked — show the expired banner.
            // We don't remove it from localStorage here so the user can still
            // see they were previously connected; setLoggedIn() has already run.
            setExpired();
            return false;
        }
        return res.ok;
    } catch {
        // Network error — can't validate, leave the logged-in UI as-is
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
    const hash   = window.location.hash;
    const search = window.location.search;
    console.log('[Auth] handleOAuthRedirect — hash:', hash ? hash.slice(0, 80) : '(empty)', '| search:', search || '(empty)');

    // Twitch returns errors in the query string (?error=...) but tokens in the hash (#access_token=...)
    const qp    = new URLSearchParams(search);
    const error = qp.get('error');
    if (error) {
        // Clean the URL immediately
        history.replaceState(null, '', window.location.pathname);
        console.error('[Auth] OAuth error from query string:', error, qp.get('error_description'));
        const desc = qp.get('error_description') || error;
        const st  = document.getElementById('status-text');
        if (st) st.textContent = `Login failed: ${desc}`;
        const dot = document.getElementById('status-dot');
        if (dot) dot.className = 'dot dot-red';
        return false;
    }

    if (!hash) return false;

    const p     = new URLSearchParams(hash.slice(1));
    const token = p.get('access_token');
    const hashError = p.get('error');
    if (hashError) {
        history.replaceState(null, '', window.location.pathname);
        console.error('[Auth] OAuth error from hash:', hashError, p.get('error_description'));
        const st  = document.getElementById('status-text');
        if (st) st.textContent = `Login failed: ${p.get('error_description') || hashError}`;
        const dot = document.getElementById('status-dot');
        if (dot) dot.className = 'dot dot-red';
        return false;
    }

    // Always clean the hash immediately so sensitive data isn't left in the URL
    history.replaceState(null, '', window.location.pathname);

    if (error) {
        // Twitch rejected the auth request (e.g. user denied, or redirect_uri mismatch)
        console.error('[Auth] OAuth error:', error, p.get('error_description'));
        const st = document.getElementById('status-text');
        if (st) st.textContent = `Login failed: ${p.get('error_description') || error}`;
        const dot = document.getElementById('status-dot');
        if (dot) dot.className = 'dot dot-red';
        return false;
    }

    if (!token) {
        console.warn('[Auth] Hash present but no access_token found. Parsed keys:', [...p.keys()].join(', '));
        return false;
    }

    console.log('[Auth] Token received and stored.');
    localStorage.setItem('twitch_access_token', token);
    localStorage.removeItem('twitch_username');
    return true;
}

// Single init entry point — no competing load listeners
window.addEventListener('load', async () => {
    try {
        // 1. Lock everything first, synchronously
        lockTabs();
        initSliders();

        // 2. Check for fresh OAuth redirect (also handles Twitch error responses)
        const freshLogin = handleOAuthRedirect();
        const token      = localStorage.getItem('twitch_access_token');

        if (token) {
            // Unlock immediately — never block the UI on a network request
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
                // Validate in the background — shows expired banner on 401 without blocking
                validateToken(token); // intentionally not awaited
            }
        }
    } catch (err) {
        // Surface any initialisation errors so they're visible in the console
        console.error('[YACOFO] Init error:', err);
    }
});