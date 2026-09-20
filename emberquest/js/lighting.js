/* ===== lighting.js — Glow switch + lighting colours =====
 *
 * Loaded in <head> so the saved theme is applied before first paint (no orange flash).
 * The theme is just a handful of CSS variables on <html>; styles.css does the rest:
 *   --accent-rgb / --accent-2-rgb / --accent-light / --on-accent   colour
 *   html[data-glow="on|off"]                                       glow intensity (--glow-k)
 *
 * Preferences are stored under their own key so they survive "Reset All Game Progress".
 */
const EmberLighting = (() => {
  const KEY = 'emberquest.lighting.v1';
  const HEX = /^#[0-9a-f]{6}$/i;

  // Ember keeps its exact original tones. Every other preset derives its shades from one base colour.
  const PRESETS = [
    { id: 'ember',   name: 'Ember',     base: '#ff7a1a',
      tones: { main: '#ff7a1a', l400: '#ff9440', l600: '#e06000', light: '#ff9d3d', rgb2: '255, 90, 0' } },
    { id: 'cyan',    name: 'Neon cyan', base: '#22d3ee' },
    { id: 'azure',   name: 'Azure',     base: '#3b82f6' },
    { id: 'violet',  name: 'Violet',    base: '#a855f7' },
    { id: 'magenta', name: 'Magenta',   base: '#ec4899' },
    { id: 'emerald', name: 'Emerald',   base: '#10b981' },
    { id: 'gold',    name: 'Gold',      base: '#facc15' }
  ];

  const DEFAULTS = { glow: true, color: 'ember', custom: '#8b5cf6' };

  /* ---------- colour maths (self-contained: util.js loads after this file) ---------- */
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
                    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function luminance([r, g, b]) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  // Keeps any picked colour vivid and readable on the dark UI.
  function tonesFromBase(base) {
    const [h, s0, l0] = rgbToHsl(hexToRgb(base));
    const s = Math.max(s0, 0.65);
    const l = clampN(l0, 0.5, 0.62);
    const at = (hue, sat, lig) => rgbToHex(hslToRgb(hue, sat, lig));
    return {
      main:  at(h, s, l),
      l400:  at(h, s, Math.min(l + 0.08, 0.76)),
      l600:  at(h, s, l - 0.12),
      light: at(h, s, Math.min(l + 0.11, 0.8)),
      rgb2:  hexToRgb(at((h + 352) % 360, s, l - 0.05)).join(', ')
    };
  }

  function themeOf(st) {
    let t;
    if (st.color === 'custom') {
      t = tonesFromBase(st.custom);
    } else {
      const p = PRESETS.find(x => x.id === st.color) || PRESETS[0];
      t = p.tones || tonesFromBase(p.base);
    }
    const rgb = hexToRgb(t.main);
    return Object.assign({}, t, {
      rgb: rgb.join(', '),
      // Ember (luminance ~0.35) keeps white text; only clearly light colours flip to dark text.
      onAccent: luminance(rgb) > 0.42 ? '#14110d' : '#ffffff'
    });
  }

  /* ---------- state ---------- */
  function load() {
    const st = Object.assign({}, DEFAULTS);
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        if (typeof raw.glow === 'boolean') st.glow = raw.glow;
        if (raw.color === 'custom' || PRESETS.some(p => p.id === raw.color)) st.color = raw.color;
        if (typeof raw.custom === 'string' && HEX.test(raw.custom)) st.custom = raw.custom.toLowerCase();
      }
    } catch (e) { /* private mode / corrupt value: fall back to defaults */ }
    return st;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  let state = load();

  function apply() {
    const root = document.documentElement;
    const t = themeOf(state);
    root.style.setProperty('--accent-rgb', t.rgb);
    root.style.setProperty('--accent-2-rgb', t.rgb2);
    root.style.setProperty('--orange-400', t.l400);
    root.style.setProperty('--orange-600', t.l600);
    root.style.setProperty('--accent-light', t.light);
    root.style.setProperty('--on-accent', t.onAccent);
    root.setAttribute('data-glow', state.glow ? 'on' : 'off');
    root.setAttribute('data-lighting', state.color);
    syncUI();
    document.dispatchEvent(new CustomEvent('lighting:change', { detail: Object.assign({}, state) }));
  }

  /* ---------- public setters ---------- */
  function setGlow(on, save = true) {
    state.glow = !!on;
    apply();
    if (save) persist();
  }
  function setColor(id) {
    if (id !== 'custom' && !PRESETS.some(p => p.id === id)) return;
    state.color = id;
    apply();
    persist();
  }
  function setCustom(hex, save = true) {
    if (!HEX.test(hex)) return;
    state.color = 'custom';
    state.custom = hex.toLowerCase();
    apply();
    if (save) persist();
  }
  function palette() {
    const t = themeOf(state);
    return [t.main, t.l400, t.light];
  }

  /* ---------- corner control ---------- */
  const $ = id => document.getElementById(id);
  const click = () => { if (typeof AudioFX !== 'undefined') AudioFX.click(); };

  function syncUI() {
    const sw = $('lighting-switch');
    if (!sw) return; // DOM not ready yet
    sw.setAttribute('aria-checked', String(state.glow));
    sw.title = state.glow ? 'Glow lighting is on. Click to turn off' : 'Glow lighting is off. Click to turn on';

    document.querySelectorAll('#lighting-swatches [data-color]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.color === state.color));
    });
    const custom = $('lighting-custom');
    if (custom) {
      custom.classList.toggle('is-selected', state.color === 'custom');
      custom.style.setProperty('--swatch', state.custom);
      const input = $('lighting-custom-input');
      if (input && input.value !== state.custom) input.value = state.custom;
    }
    const name = $('lighting-color-name');
    if (name) {
      const p = PRESETS.find(x => x.id === state.color);
      name.textContent = p ? p.name : 'Custom';
    }
  }

  function initUI() {
    const dock = $('lighting-dock');
    if (!dock) return;
    const panel = $('lighting-panel');
    const paletteBtn = $('lighting-palette-btn');
    const swatches = $('lighting-swatches');

    swatches.innerHTML = PRESETS.map(p => `
      <button type="button" class="lighting-swatch" data-color="${p.id}"
              style="--swatch: ${p.base}" title="${p.name}" aria-label="${p.name}" aria-pressed="false"></button>
    `).join('') + `
      <label class="lighting-swatch lighting-custom" id="lighting-custom" title="Custom colour">
        <input type="color" id="lighting-custom-input" value="${state.custom}" aria-label="Custom lighting colour">
      </label>
    `;

    const setPanel = open => {
      panel.hidden = !open;
      paletteBtn.setAttribute('aria-expanded', String(open));
    };

    $('lighting-switch').addEventListener('click', () => { setGlow(!state.glow); click(); });
    paletteBtn.addEventListener('click', () => { setPanel(panel.hidden); click(); });

    swatches.addEventListener('click', e => {
      const btn = e.target.closest('[data-color]');
      if (!btn) return;
      setColor(btn.dataset.color);
      click();
    });

    const customInput = $('lighting-custom-input');
    customInput.addEventListener('input', () => setCustom(customInput.value, false)); // live preview while dragging
    customInput.addEventListener('change', () => { setCustom(customInput.value); click(); });

    document.addEventListener('click', e => {
      if (!panel.hidden && !dock.contains(e.target)) setPanel(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !panel.hidden) { setPanel(false); paletteBtn.focus(); }
    });

    syncUI();
  }

  apply(); // before first paint
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();

  return { get: () => Object.assign({}, state), setGlow, setColor, setCustom, palette, PRESETS };
})();
