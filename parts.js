// Attachment offsets are relative to the body center, in pixels.
// These are starting points — students are expected to tune them.
const PARTS = {
    body:   {
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        shapes: ['A', 'B', 'C', 'D', 'E', 'F'],
        // texture key pattern: body_{color}{shape}
        offset: { x: 0,   y: 0 }
    },
    arm:     { 
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        shapes: ['A', 'B', 'C', 'D', 'E'],
        // arm_{color}{A|B|C|D|E}
        offset: { x: 90,  y: 10  } 
    },  
    leg:     {
        colors: ['blue', 'green', 'red', 'yellow', 'dark', 'white'],
        shapes: ['A', 'B', 'C', 'D', 'E'],
        offset: { x: 45,  y: 100 },
    },
    eye:     {
        offset: { x: 0,   y: -30 }, spacing: 40,  // eye_{style}
        // Map the tool's style enum to actual texture filenames in assets/
        styles: {
            normal: 'eye_blue',
            angry:  'eye_angry_red',
            happy:  'eye_closed_happy',
            sleepy: 'eye_closed_feminine',
        },
    },
    mouth:   { offset: { x: 0,   y: 30  } },   // mouth{A..J}
    antenna: { offset: { x: 0,   y: -95 }, spacing: 50 },  // detail_{color}_antenna_{small|large}
};
const CENTER_X = 400;
const CENTER_Y = 300;

// ---------------------------------------------------------------------
// Color instrumentation (Part 1a/1b of the extension assignment).
//
// Phaser's tint is MULTIPLICATIVE: each channel of the tint is multiplied
// with each channel of the texture's own pixels. Tinting a dark texture
// with a bright color does not repaint it that color — it darkens
// everything toward black/mud, because dark_channel * bright_channel is
// still small relative to 255. Only lighter base parts take tints in a
// way that resembles the tint color. These helpers let the game compute
// (rather than guess) what a tint will actually produce, so replies can
// tell the agent the real result instead of just echoing the hex it sent.
// ---------------------------------------------------------------------

// Approximate base colors for each part color name, eyedropped from the
// sprites. Rough is fine — this is for relative reasoning, not exact color
// matching. Keyed by the same color names used in body/arm/leg/antenna params.
const PART_BASE_COLORS = {
    blue: '#3b6ea5', green: '#5ba85b', red: '#c94f4f',
    yellow: '#d9c05a', dark: '#4a4a52', white: '#d8d8d8',
};

// Compute the actual resulting color when `tintHex` is applied as a
// multiplicative tint over a texture whose dominant color is `baseHex`.
function effectiveColor(baseHex, tintHex) {
    const b = parseInt(baseHex.slice(1), 16);
    const t = parseInt(tintHex.slice(1), 16);
    const ch = (shift) =>
        Math.round(((b >> shift & 0xff) * (t >> shift & 0xff)) / 255);
    return '#' + [16, 8, 0]
        .map(s => ch(s).toString(16).padStart(2, '0')).join('');
}

// 0–255 perceptual brightness of a hex color (standard luma weights).
// Gives the agent a single comparable number instead of reasoning about
// hex strings directly, which language models are unreliable at.
function luminance(hex) {
    const v = parseInt(hex.slice(1), 16);
    return Math.round(0.2126 * (v >> 16 & 255)
                    + 0.7152 * (v >> 8 & 255)
                    + 0.0722 * (v & 255));
}

function luminanceLabel(lum) {
    if (lum < 60) return 'very dark';
    if (lum < 110) return 'dark';
    if (lum < 170) return 'medium';
    if (lum < 220) return 'bright';
    return 'very bright';
}

// Formats the "(base X, tint Y, effective ≈ Z — label)" suffix appended to
// game-side command replies. Returns '' when there's no known base color
// for this part (e.g. eyes/mouths, which are keyed by style, not color)
// or no tint was applied.
function describeTint(colorName, tintHex) {
    const base = PART_BASE_COLORS[colorName];
    if (!base || !tintHex) return '';
    const eff = effectiveColor(base, tintHex);
    const lum = luminance(eff);
    return ` (base ${colorName} ${base}, tint ${tintHex}, effective ≈ ${eff} — ${luminanceLabel(lum)})`;
}