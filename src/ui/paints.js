// ─── ui/paints.js ─────────────────────────────────────────────────────────────
// Converts 7TV paint objects into CSS and applies them to DOM elements
// (username spans, and message-text spans for /me colored actions).
//
// Why injected <style> tags instead of inline styles?
// OBS's browser source silently drops -webkit-background-clip when set via
// element.style, which breaks gradient paints. A real <style> block works fine.
// Each paint gets a unique generated class name so multiple users can have
// different paints simultaneously without collision.

// Incremented for each new paint applied — ensures unique class names
let paintClassCounter = 0;

// Applies a 7TV paint to a DOM element by injecting a CSS class.
// The <style> tag is stored with data-paint so it can be removed on refresh.
function applyPaint(element, paint) {
    if (!paint) return;

    const className = `seventv-paint-${++paintClassCounter}`;
    const css = buildPaintCSS(`.${className}`, paint);
    if (!css) return;

    const styleTag = document.createElement('style');
    styleTag.textContent    = css;
    styleTag.dataset.paint  = className; // used to find and remove this style on update
    document.head.appendChild(styleTag);

    element.classList.add(className);
    element.style.display    = 'inline-block'; // required for background-clip to work
    element.style.textShadow = 'none';         // paint manages its own shadows via filter
}

// Builds the full CSS rule for a given paint and selector
function buildPaintCSS(selector, paint) {
    const layers    = buildPaintLayers(paint);
    const shadowCSS = buildPaintShadows(paint);

    if (!layers && !shadowCSS) return null;

    let rules = '';

    if (layers) {
        // Clip the gradient(s) to the text shape so they colour only the glyphs.
        // background-size/background-repeat must stay comma-aligned with
        // background-image index-for-index — browsers pair these lists
        // positionally, not by matching layer type.
        rules += `
    background-image: ${layers.map(l => l.image).join(', ')};
    background-size: ${layers.map(l => l.size).join(', ')};
    background-repeat: ${layers.map(l => l.repeat).join(', ')};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;`;
    }

    if (shadowCSS) {
        // Shadows are applied as CSS filter drop-shadow rather than text-shadow
        // because text-shadow doesn't work when text-fill-color is transparent
        rules += `
    filter: ${shadowCSS};`;
    }

    return `${selector} {${rules}\n}`;
}

// Builds the ordered list of CSS background layers for a paint. 7TV paints
// can stack multiple gradient/image layers (paint.gradients) since the v4
// cosmetics model; the older single-layer function/color/stops/angle/repeat/
// image_url fields directly on the paint are deprecated (7TV computes them
// server-side from just the first layer), so we only fall back to those if
// `gradients` is ever missing from the response.
function buildPaintLayers(paint) {
    let layers;

    if (paint.gradients?.length) {
        layers = paint.gradients.map(buildGradientLayer).filter(Boolean);
    } else if (paint.function) {
        // Deprecated flat shape — same field names as one gradient layer.
        // Still required in practice: 7TV's v3 GQL endpoint always returns
        // `gradients` as an empty array (never implemented server-side), so
        // these deprecated fields are the only ones that actually carry data.
        const layer = buildGradientLayer(paint);
        layers = layer ? [layer] : [];
    } else if (paint.color != null) {
        // Solid-color paint with no gradient layers at all
        const c = intToRGBA(paint.color);
        layers = [{ image: `linear-gradient(${c}, ${c})`, size: 'auto', repeat: 'no-repeat' }];
    } else {
        layers = [];
    }

    return layers.length ? layers : null;
}

// Converts a single 7TV gradient layer into a CSS background-image value,
// paired with the background-size/background-repeat it needs.
function buildGradientLayer(layer) {
    const stops = (layer.stops || []).map(s =>
        `${intToRGBA(s.color)} ${(s.at * 100).toFixed(1)}%`
    );

    switch (layer.function) {
        case 'LINEAR_GRADIENT': {
            if (!stops.length) return null;
            const angle  = layer.angle ?? 90;
            const repeat = layer.repeat ? 'repeating-linear-gradient' : 'linear-gradient';
            return { image: `${repeat}(${angle}deg, ${stops.join(', ')})`, size: 'auto', repeat: 'no-repeat' };
        }
        case 'RADIAL_GRADIENT': {
            if (!stops.length) return null;
            // CosmeticPaintShape is serialized as lowercase snake_case by 7TV
            // ('circle'/'ellipse') — unlike CosmeticPaintFunction just above,
            // which uses SCREAMING_SNAKE_CASE. Different enums, different casing.
            const shape  = layer.shape === 'ellipse' ? 'ellipse' : 'circle';
            const repeat = layer.repeat ? 'repeating-radial-gradient' : 'radial-gradient';
            return { image: `${repeat}(${shape}, ${stops.join(', ')})`, size: 'auto', repeat: 'no-repeat' };
        }
        case 'URL':
            if (!layer.image_url) return null;
            // Image layers need explicit sizing so the image covers the text
            return { image: `url('${layer.image_url}')`, size: 'auto 100%', repeat: 'repeat-x' };
        default: {
            // Unknown layer type — fall back to a flat color from the first stop
            if (!stops.length) return null;
            const c = intToRGBA(layer.stops[0].color);
            return { image: `linear-gradient(${c}, ${c})`, size: 'auto', repeat: 'no-repeat' };
        }
    }
}

// Converts 7TV shadow definitions to CSS filter: drop-shadow() chains
function buildPaintShadows(paint) {
    if (!paint.shadows?.length) return null;
    return paint.shadows.map(s =>
        `drop-shadow(${s.x_offset}px ${s.y_offset}px ${s.radius}px ${intToRGBA(s.color)})`
    ).join(' ');
}

// 7TV encodes all colors as signed 32-bit integers in RGBA byte order.
// We convert to CSS rgba() by unpacking each byte.
function intToRGBA(int) {
    const unsigned = int >>> 0; // treat as unsigned
    const r = (unsigned >> 24) & 0xff;
    const g = (unsigned >> 16) & 0xff;
    const b = (unsigned >> 8)  & 0xff;
    const a = ((unsigned & 0xff) / 255).toFixed(3);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}