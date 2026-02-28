// ─── ui/paints.js ─────────────────────────────────────────────────────────────
// Converts 7TV paint objects into CSS and applies them to username spans.
// Uses injected <style> tags rather than inline styles because OBS's browser
// silently drops -webkit-background-clip when set via element.style.

// Counter for generating unique class names per user
let paintClassCounter = 0;

function applyPaint(element, paint) {
    if (!paint) return;

    const className = `seventv-paint-${++paintClassCounter}`;
    const css = buildPaintCSS(`.${className}`, paint);
    if (!css) return;

    // Inject a <style> block — vendor prefixes work here unlike inline styles
    const styleTag = document.createElement('style');
    styleTag.textContent = css;
    document.head.appendChild(styleTag);

    element.classList.add(className);
    element.style.display = 'inline-block';
}

function buildPaintCSS(selector, paint) {
    const gradientCSS = buildPaintGradient(paint);
    const shadowCSS   = buildPaintShadows(paint);

    if (!gradientCSS && !shadowCSS) return null;

    let rules = '';

    if (gradientCSS) {
        rules += `
    background-image: ${gradientCSS};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;`;
    }

    if (shadowCSS) {
        rules += `
    filter: ${shadowCSS};`;
    }

    return `${selector} {${rules}\n}`;
}

function buildPaintGradient(paint) {
    const stops = (paint.stops || []).map(s => {
        return `${intToRGBA(s.color)} ${(s.at * 100).toFixed(1)}%`;
    });

    if (!stops.length) return null;

    switch (paint.function) {
        case 'LINEAR_GRADIENT': {
            const angle  = paint.angle ?? 90;
            const repeat = paint.repeat ? 'repeating-linear-gradient' : 'linear-gradient';
            return `${repeat}(${angle}deg, ${stops.join(', ')})`;
        }
        case 'RADIAL_GRADIENT': {
            const repeat = paint.repeat ? 'repeating-radial-gradient' : 'radial-gradient';
            return `${repeat}(circle, ${stops.join(', ')})`;
        }
        case 'CONIC_GRADIENT': {
            const angle = paint.angle ?? 0;
            return `conic-gradient(from ${angle}deg, ${stops.join(', ')})`;
        }
        default:
            if (paint.stops?.length) {
                const c = intToRGBA(paint.stops[0].color);
                return `linear-gradient(${c}, ${c})`;
            }
            return null;
    }
}

function buildPaintShadows(paint) {
    if (!paint.shadows?.length) return null;
    return paint.shadows.map(s => {
        const color = intToRGBA(s.color);
        return `drop-shadow(${s.x_offset}px ${s.y_offset}px ${s.radius}px ${color})`;
    }).join(' ');
}

// 7TV encodes colors as signed 32-bit integers (RGBA)
function intToRGBA(int) {
    const unsigned = int >>> 0;
    const r = (unsigned >> 24) & 0xff;
    const g = (unsigned >> 16) & 0xff;
    const b = (unsigned >> 8)  & 0xff;
    const a = ((unsigned & 0xff) / 255).toFixed(3);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}