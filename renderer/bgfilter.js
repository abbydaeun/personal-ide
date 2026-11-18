// Softens dark background colors in terminal output so they suit the light paper theme.
//
// Claude Code paints your prompts on ANSI "bright black" (and some blocks on
// "black"), diffs on green/red, and in its RGB themes on fixed dark colors like
// rgb(55,55,55). On a light terminal those read as heavy brown/maroon blocks.
// We rewrite only *background* parameters inside SGR sequences (ESC [ ... m);
// foreground colors are untouched, and xterm's minimumContrastRatio keeps any
// text readable against the new, lighter backgrounds.
'use strict';

(function (root) {
  const PAPER_DARK = [243, 236, 223];  // #f3ecdf: prompts, quoted blocks
  const PAPER_DARKER = [237, 228, 212]; // #ede4d4: bash/command blocks
  const SOFT_GREEN = [222, 242, 214];   // diff added
  const SOFT_RED = [252, 224, 226];     // diff removed
  const SOFT_BLUE = [226, 231, 247];
  const SOFT_YELLOW = [251, 240, 204];
  const SOFT_MAGENTA = [246, 226, 240];
  const SOFT_CYAN = [220, 241, 245];

  const ANSI_BG = {
    40: PAPER_DARKER, 100: PAPER_DARK,  // black / bright black
    41: SOFT_RED, 101: SOFT_RED,
    42: SOFT_GREEN, 102: SOFT_GREEN,
    43: SOFT_YELLOW, 103: SOFT_YELLOW,
    44: SOFT_BLUE, 104: SOFT_BLUE,
    45: SOFT_MAGENTA, 105: SOFT_MAGENTA,
    46: SOFT_CYAN, 106: SOFT_CYAN,
  };
  const XTERM16 = [ANSI_BG[40], ANSI_BG[41], ANSI_BG[42], ANSI_BG[43], ANSI_BG[44], ANSI_BG[45], ANSI_BG[46], null,
    ANSI_BG[100], ANSI_BG[101], ANSI_BG[102], ANSI_BG[103], ANSI_BG[104], ANSI_BG[105], ANSI_BG[106], null];

  const rgbParams = (c) => ['48', '2', String(c[0]), String(c[1]), String(c[2])];

  // Map a dark RGB background to a pale tint of the same hue family; leave light ones alone.
  function softenRgb(r, g, b) {
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum > 0.55) return null;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 28) return lum < 0.3 ? PAPER_DARK : PAPER_DARKER; // greys
    if (g === max && g - r > 20) return SOFT_GREEN;
    if (r === max && r - b > 20 && r - g > 20) return SOFT_RED;
    if (b === max) return SOFT_BLUE;
    if (r === max && g > b) return SOFT_YELLOW;
    return SOFT_MAGENTA;
  }

  // 256-color index -> softened RGB (or null to keep).
  function soften256(n) {
    if (n < 16) return XTERM16[n];
    if (n >= 232) { const v = 8 + (n - 232) * 10; return v < 140 ? PAPER_DARK : null; }
    const i = n - 16, steps = [0, 95, 135, 175, 215, 255];
    return softenRgb(steps[Math.floor(i / 36)], steps[Math.floor(i / 6) % 6], steps[i % 6]);
  }

  function rewriteParams(body) {
    if (!body) return body;
    const p = body.split(';');
    const out = [];
    let changed = false;
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (ANSI_BG[v]) { out.push(...rgbParams(ANSI_BG[v])); changed = true; continue; }
      if (v === '48' && p[i + 1] === '5' && p[i + 2] != null) {
        const c = soften256(+p[i + 2]);
        if (c) { out.push(...rgbParams(c)); changed = true; } else out.push(v, p[i + 1], p[i + 2]);
        i += 2; continue;
      }
      if (v === '48' && p[i + 1] === '2' && p[i + 4] != null) {
        const c = softenRgb(+p[i + 2], +p[i + 3], +p[i + 4]);
        if (c) { out.push(...rgbParams(c)); changed = true; } else out.push(...p.slice(i, i + 5));
        i += 4; continue;
      }
      if ((v === '38' || v === '58') && (p[i + 1] === '5' || p[i + 1] === '2')) {
        // Foreground / underline color: copy through untouched (don't misread its numbers as bg codes).
        const n = p[i + 1] === '5' ? 3 : 5;
        out.push(...p.slice(i, i + n)); i += n - 1; continue;
      }
      out.push(v);
    }
    return changed ? out.join(';') : body;
  }

  const SGR = /\x1b\[([0-9;]*)m/g;
  // A trailing, possibly incomplete escape sequence is held back until the next chunk.
  const PARTIAL = /\x1b(\[[0-9;]*)?$/;

  function createBackgroundFilter() {
    let carry = '';
    return function filter(chunk) {
      let s = carry + chunk;
      carry = '';
      const m = s.match(PARTIAL);
      if (m) { carry = m[0]; s = s.slice(0, m.index); }
      return s.indexOf('\x1b[') === -1 ? s : s.replace(SGR, (all, body) => {
        const nb = rewriteParams(body);
        return nb === body ? all : `\x1b[${nb}m`;
      });
    };
  }

  root.createBackgroundFilter = createBackgroundFilter;
  if (typeof module !== 'undefined') module.exports = { createBackgroundFilter };
})(typeof window !== 'undefined' ? window : globalThis);
