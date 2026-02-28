// ─── ui/paints.js ─────────────────────────────────────────────────────────────
// Converts 7TV paint objects into CSS and applies them to username spans.
// 7TV paints can be gradients, solid colors, or image-based, with optional
// drop shadows and text stroke effects.

function applyPaint(element, paint) {
    if (!paint) return;

    const shadows = (paint.shadows || []).map(s => {
        const color = intToRGBA(s.color);
        return `${s.x_offset}px ${s.y_offset}px ${s.radius}px ${color}`;
    }).join(', ');

    if (shadows) {
        element.style.textShadow = shadows;
    }

    // Build the gradient or solid color for -webkit-background-clip text effect
    const gradientCSS = buildPaintGradient(paint);
    if (gradientCSS) {
        element.style.backgroundImage    = gradientCSS;
        element.style.webkitBackgroundClip = 'text';
        element.style.backgroundClip     = 'text';
        element.style.webkitTextFillColor = 'transparent';
        element.style.color              = 'transparent';
    }
}

function buildPaintGradient(paint) {
    console.log('[7TV Paint] buildPaintGradient received:', JSON.stringify(paint));
    const stops = (paint.stops || []).map(s => {
        return `${intToRGBA(s.color)} ${(s.at * 100).toFixed(1)}%`;
    });

    if (!stops.length) return null;

    switch (paint.function) {
        case 'LINEAR_GRADIENT': {
            const angle = paint.angle ?? 90;
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
            // Solid color — use first stop color
            if (paint.stops?.length) {
                return `linear-gradient(${intToRGBA(paint.stops[0].color)}, ${intToRGBA(paint.stops[0].color)})`;
            }
            return null;
    }
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