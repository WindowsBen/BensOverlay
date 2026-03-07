// ─── ui/mod-animations.js ─────────────────────────────────────────────────────
// Dramatic visual animations for ban and timeout moderation actions.
// These render in a dedicated fixed overlay container, separate from chat.
//
// Ban:     Hammer winds up → swings down → letters explode outward and fade
// Timeout: Clock descends onto name → hands spin fast → name freezes and fades
//
// Each animation is self-contained and cleans itself up from the DOM.

const HAMMER_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Handle -->
    <rect x="28" y="28" width="9" height="30" rx="4" fill="#8B5E3C" stroke="#5C3D1E" stroke-width="1.5"/>
    <!-- Head body -->
    <rect x="10" y="8" width="44" height="26" rx="6" fill="#C0C0C0" stroke="#888" stroke-width="1.5"/>
    <!-- Head face highlight -->
    <rect x="12" y="10" width="40" height="10" rx="4" fill="#E8E8E8" opacity="0.6"/>
    <!-- Claw notch -->
    <path d="M10 28 L4 36 L10 34 Z" fill="#A0A0A0" stroke="#888" stroke-width="1"/>
</svg>`;

// Impact shockwave SVG — rendered briefly at the moment of contact
const SHOCKWAVE_SVG = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="60" r="20" stroke="white" stroke-width="3" opacity="0.9"/>
    <circle cx="60" cy="60" r="35" stroke="white" stroke-width="2" opacity="0.6"/>
    <circle cx="60" cy="60" r="50" stroke="white" stroke-width="1" opacity="0.3"/>
    <!-- Star burst lines -->
    <line x1="60" y1="5"  x2="60" y2="20"  stroke="white" stroke-width="2" opacity="0.8"/>
    <line x1="60" y1="100" x2="60" y2="115" stroke="white" stroke-width="2" opacity="0.8"/>
    <line x1="5"  y1="60" x2="20" y2="60"  stroke="white" stroke-width="2" opacity="0.8"/>
    <line x1="100" y1="60" x2="115" y2="60" stroke="white" stroke-width="2" opacity="0.8"/>
    <line x1="20" y1="20" x2="31" y2="31"  stroke="white" stroke-width="1.5" opacity="0.7"/>
    <line x1="89" y1="89" x2="100" y2="100" stroke="white" stroke-width="1.5" opacity="0.7"/>
    <line x1="100" y1="20" x2="89" y2="31" stroke="white" stroke-width="1.5" opacity="0.7"/>
    <line x1="20"  y1="100" x2="31" y2="89" stroke="white" stroke-width="1.5" opacity="0.7"/>
</svg>`;

// Splits a username string into individual letter <span> elements inside a wrapper div
function buildNameSpans(username) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mod-anim-name';
    for (const char of username) {
        const span = document.createElement('span');
        span.textContent = char;
        wrapper.appendChild(span);
    }
    return wrapper;
}

// Creates and mounts the shared animation stage
function createStage(extraClass) {
    const stage = document.createElement('div');
    stage.className = `mod-anim-stage ${extraClass}`;

    const hammer = document.createElement('div');
    hammer.className = 'mod-anim-hammer';
    hammer.innerHTML = HAMMER_SVG;

    const shockwave = document.createElement('div');
    shockwave.className = 'mod-anim-shockwave';
    shockwave.innerHTML = SHOCKWAVE_SVG;

    stage.appendChild(hammer);
    stage.appendChild(shockwave);
    document.getElementById('mod-anim-overlay').appendChild(stage);

    return { stage, hammer, shockwave };
}

// ── Ban animation ─────────────────────────────────────────────────────────────
// Hammer swings → letters explode outward
function showBanAnimation(username) {
    const { stage, hammer, shockwave } = createStage('ban-anim');

    const nameEl = buildNameSpans(username);
    stage.appendChild(nameEl);

    // Phase 1 (0ms): stage fades in, hammer in wind-up position
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add('visible')));

    // Phase 2 (400ms): hammer swings down
    setTimeout(() => hammer.classList.add('swinging'), 400);

    // Phase 3 (750ms): impact — shockwave + scatter letters
    setTimeout(() => {
        shockwave.classList.add('visible');

        nameEl.querySelectorAll('span').forEach(span => {
            // Random scatter direction — bias upward/outward from impact point
            const angle   = (Math.random() * 260) - 220;  // mostly upward arc
            const dist    = 80 + Math.random() * 140;
            const rx      = Math.cos((angle * Math.PI) / 180) * dist;
            const ry      = Math.sin((angle * Math.PI) / 180) * dist - 40;
            const rot     = (Math.random() - 0.5) * 900;
            span.style.setProperty('--sx', `${rx}px`);
            span.style.setProperty('--sy', `${ry}px`);
            span.style.setProperty('--sr', `${rot}deg`);
            span.classList.add('scatter');
        });
    }, 750);

    // Phase 4 (1300ms): fade out entire stage
    setTimeout(() => stage.classList.add('fading'), 1300);

    // Phase 5 (1900ms): remove from DOM
    setTimeout(() => stage.remove(), 1900);
}

// ── Timeout animation ─────────────────────────────────────────────────────────
// Clock descends from above → hands spin rapidly → name fades out frozen
function showTimeoutAnimation(username, duration) {
    const stage = document.createElement('div');
    stage.className = 'mod-anim-stage timeout-anim';
    document.getElementById('mod-anim-overlay').appendChild(stage);

    // Build the clock — face + hour hand + minute hand as separate DOM elements
    // so we can animate the hands independently via CSS classes
    const clockEl = document.createElement('div');
    clockEl.className = 'mod-anim-clock';
    clockEl.innerHTML = `
        <svg class="clock-face" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Outer ring -->
            <circle cx="40" cy="40" r="36" fill="#1a1a2e" stroke="#FF8C00" stroke-width="3"/>
            <!-- Inner ring highlight -->
            <circle cx="40" cy="40" r="32" fill="none" stroke="#FF8C00" stroke-width="0.5" opacity="0.4"/>
            <!-- Hour marks -->
            <line x1="40" y1="8"  x2="40" y2="14" stroke="#FF8C00" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="40" y1="66" x2="40" y2="72" stroke="#FF8C00" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="8"  y1="40" x2="14" y2="40" stroke="#FF8C00" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="66" y1="40" x2="72" y2="40" stroke="#FF8C00" stroke-width="2.5" stroke-linecap="round"/>
            <!-- Minor marks -->
            <line x1="59" y1="13" x2="56" y2="18" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="67" y1="21" x2="62" y2="24" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="67" y1="59" x2="62" y2="56" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="59" y1="67" x2="56" y2="62" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="21" y1="67" x2="24" y2="62" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="13" y1="59" x2="18" y2="56" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="13" y1="21" x2="18" y2="24" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <line x1="21" y1="13" x2="24" y2="18" stroke="#FF8C00" stroke-width="1" opacity="0.5" stroke-linecap="round"/>
            <!-- Center pin -->
            <circle cx="40" cy="40" r="3" fill="#FF8C00"/>
        </svg>
        <!-- Hour hand — rotates around clock center (40,40) -->
        <svg class="clock-hand clock-hour" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="40" y1="40" x2="40" y2="20" stroke="#FF8C00" stroke-width="3.5" stroke-linecap="round"/>
        </svg>
        <!-- Minute hand — rotates around clock center (40,40) -->
        <svg class="clock-hand clock-minute" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="40" y1="40" x2="40" y2="12" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.9"/>
        </svg>`;

    // Duration label on the clock face
    if (duration) {
        const badge = document.createElement('div');
        badge.className = 'mod-anim-duration';
        badge.textContent = duration;
        clockEl.appendChild(badge);
    }

    const nameEl = buildNameSpans(username);

    stage.appendChild(clockEl);
    stage.appendChild(nameEl);

    // Phase 1 (0ms): fade in, clock starts above
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add('visible')));

    // Phase 2 (150ms): clock descends onto the name
    setTimeout(() => clockEl.classList.add('descending'), 150);

    // Phase 3 (700ms): clock lands — hands spin fast
    setTimeout(() => {
        clockEl.classList.add('landed');
        clockEl.querySelector('.clock-hour').classList.add('spinning-hour');
        clockEl.querySelector('.clock-minute').classList.add('spinning-minute');
    }, 700);

    // Phase 4 (1100ms): name freezes out
    setTimeout(() => {
        nameEl.querySelectorAll('span').forEach((span, i) => {
            span.style.animationDelay = `${i * 25}ms`;
            span.classList.add('freeze');
        });
    }, 1100);

    // Phase 5 (1700ms): everything fades
    setTimeout(() => stage.classList.add('fading'), 1700);
    setTimeout(() => stage.remove(), 2300);
}