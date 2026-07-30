// =============================================================
// Jarvis — the dashboard's central AI. One shared module included
// on every page (like topbar.js), so he isn't just a Main-page
// feature: wherever you are, tapping/opening him gets the same
// brain, the same live dashboard context, and the same voice.
//
// On index.html, a hero orb + orbit of tiles already exists in the
// page's own markup with id="jarvisCore" — this script finds it and
// wires it up. On every other page, no such element exists, so this
// script injects a small floating orb (the "FAB") in the corner
// instead. Either way, the rest of the code just talks to whatever
// #jarvisCore turns out to be.
//
// Brain: free OpenRouter key, shared with Nova/nutrition's estimator
// (localStorage key 'nova_lite_api_key' — set it once anywhere, it
// works everywhere). Voice out: ElevenLabs if a key+voice id are set
// (Jarvis's own settings panel, gear icon in his chat header),
// otherwise the browser's free built-in speechSynthesis. Voice in:
// the browser's free built-in SpeechRecognition. Context: a live
// dump of WHOOP, nutrition, gym, sun/vitD, and profile data already
// on this device, plus a free-text "notes" field for anything the
// user wants remembered — NOT actual Claude conversation history,
// which no API exposes to a webpage.
// =============================================================
(function () {
  'use strict';

  function isEmbedded() { try { return window.self !== window.top; } catch (e) { return true; } }
  if (isEmbedded()) return;
  if (document.getElementById('jarvisBg')) return; // already booted on this page

  const $ = (id) => document.getElementById(id);
  function loadJSON(k, f) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- CSS ---------- */
  const css = `
:root {
  --jarvis-cyan: #2DE1FC;
  --jarvis-cyan-deep: #0891B2;
}
.jarvis-core {
  position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: 50%; cursor: pointer; overflow: visible; -webkit-tap-highlight-color: transparent;
  background: radial-gradient(circle at 34% 28%, #eafeff 0%, var(--jarvis-cyan) 46%, var(--jarvis-cyan-deep) 100%);
  box-shadow: 0 0 34px color-mix(in srgb, var(--jarvis-cyan) 60%, transparent), inset 0 0 24px rgba(255,255,255,0.3);
  animation: jarvis-pulse 3.2s ease-in-out infinite;
  transition: transform 0.15s ease, box-shadow 0.3s ease;
}
.jarvis-fab:hover, .jarvis-fab:focus-visible { transform: scale(1.06); }
.jarvis-core.listening { animation: jarvis-pulse 3.2s ease-in-out infinite, jarvis-listen 1s ease-in-out infinite; }
.jarvis-core.thinking .jarvis-ring-sweep { animation-duration: 0.7s; }
@keyframes jarvis-pulse {
  0%, 100% { box-shadow: 0 0 34px color-mix(in srgb, var(--jarvis-cyan) 55%, transparent), inset 0 0 24px rgba(255,255,255,0.28); }
  50% { box-shadow: 0 0 48px color-mix(in srgb, var(--jarvis-cyan) 75%, transparent), inset 0 0 30px rgba(255,255,255,0.4); }
}
@keyframes jarvis-listen { 0%,100% { box-shadow: 0 0 34px color-mix(in srgb, var(--jarvis-cyan) 70%, transparent); } 50% { box-shadow: 0 0 64px color-mix(in srgb, var(--jarvis-cyan) 95%, transparent); } }
.jarvis-core::before { content: ''; position: absolute; inset: 15%; border: 1px solid rgba(255,255,255,0.55); border-radius: 50%; pointer-events: none; }
.jarvis-ring-sweep {
  position: absolute; inset: -12%; border-radius: 50%; pointer-events: none;
  background: conic-gradient(from 0deg, transparent 0%, color-mix(in srgb, var(--jarvis-cyan) 95%, white 10%) 6%, transparent 18%);
  -webkit-mask: radial-gradient(circle, transparent 63%, #000 65%, #000 100%);
          mask: radial-gradient(circle, transparent 63%, #000 65%, #000 100%);
  animation: jarvis-sweep 3.4s linear infinite;
}
@keyframes jarvis-sweep { to { transform: rotate(360deg); } }
.jarvis-ring-ticks {
  position: absolute; inset: -20%; border-radius: 50%; pointer-events: none; opacity: 0.65;
  background: repeating-conic-gradient(rgba(255,255,255,0.4) 0deg 1deg, transparent 1deg 30deg);
  -webkit-mask: radial-gradient(circle, transparent 70%, #000 72%, #000 76%, transparent 78%);
          mask: radial-gradient(circle, transparent 70%, #000 72%, #000 76%, transparent 78%);
}
.jarvis-core-icon { position: relative; z-index: 1; fill: #06282e; stroke: none; transition: opacity 0.4s ease, transform 0.4s ease; }

/* Voice-triggered activation: a one-shot expanding ring (re-triggered by
   toggling the class off/on with a forced reflow) so saying "Jarvis" gets an
   immediate, satisfying visual acknowledgment even though the chat modal
   never opens for this path. */
.jarvis-core.wake-burst::after {
  content: ''; position: absolute; inset: -10%; border-radius: 50%; pointer-events: none;
  border: 2px solid var(--jarvis-cyan); opacity: 0.9;
  animation: jarvis-burst 0.8s cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
}
@keyframes jarvis-burst { from { transform: scale(0.7); opacity: 0.9; } to { transform: scale(1.7); opacity: 0; } }
/* Held while a wake-triggered exchange is in progress — a livelier sweep and
   deeper glow than idle, so the orb visibly feels "engaged." */
.jarvis-core.voice-active { animation: jarvis-pulse 1.8s ease-in-out infinite; }
.jarvis-core.voice-active .jarvis-ring-sweep { animation-duration: 1.6s; }

/* ---------- Hologram face: shown only while voice-active, replacing the
   sparkle icon with a canvas-drawn wireframe/constellation face (glowing
   node points + connecting lines, à la a holographic face scan) — mouth
   points animate open/closed while he's actually speaking, brows shift
   slightly for a "thinking" look while a reply is being generated. ---------- */
.jarvis-face-canvas {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  opacity: 0; transform: scale(0.9); transition: opacity 0.45s ease, transform 0.45s ease;
}
.jarvis-core.voice-active .jarvis-face-canvas { opacity: 1; transform: scale(1); }
.jarvis-core.voice-active .jarvis-core-icon { opacity: 0; transform: scale(0.7); }

/* Floating orb (every page except index.html, which has its own hero) */
.jarvis-fab {
  position: fixed; right: 18px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 90;
  width: 60px; height: 60px;
}
.jarvis-fab .jarvis-core-icon { width: 22px; height: 22px; }

/* Hero variant (index.html) gets bigger icon via its own size */
#jarvisCore:not(.jarvis-fab) .jarvis-core-icon { width: 30px; height: 30px; }

/* ---------- Chat modal ---------- */
.jarvis-modal-bg { position: fixed; inset: 0; z-index: 200; display: none; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,0.62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.jarvis-modal-bg.show { display: flex; }
.jarvis-modal {
  width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column;
  background: #0b0e10; border: 1px solid rgba(45,225,252,0.18); border-radius: 18px; padding: 20px;
  box-shadow: 0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(45,225,252,0.08);
  font-family: var(--font, -apple-system, sans-serif); color: var(--text-secondary, #B8B6B0);
}
.jarvis-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.jarvis-modal-title { font-size: 16px; font-weight: 700; color: #fff; letter-spacing: 0.02em; display: flex; align-items: center; gap: 8px; }
.jarvis-modal-title .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--jarvis-cyan); box-shadow: 0 0 8px var(--jarvis-cyan); }
.jarvis-head-btns { display: flex; gap: 6px; }
.jarvis-icon-btn { border: 0; background: transparent; color: rgba(255,255,255,0.5); font-size: 20px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 8px; transition: background 0.15s, color 0.15s; }
.jarvis-icon-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }

.jarvis-settings { display: none; flex-direction: column; gap: 8px; margin-bottom: 14px; padding: 12px; border-radius: 12px; background: rgba(45,225,252,0.05); border: 1px solid rgba(45,225,252,0.15); }
.jarvis-settings.show { display: flex; }
.jarvis-settings label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
.jarvis-settings input, .jarvis-settings textarea {
  width: 100%; padding: 9px 11px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.3); color: #fff; font-family: inherit; font-size: 12.5px; outline: none;
}
.jarvis-settings small { font-size: 10.5px; color: rgba(255,255,255,0.35); line-height: 1.4; }
.jarvis-settings-save { align-self: flex-start; margin-top: 2px; padding: 7px 14px; border-radius: 8px; border: 1px solid rgba(45,225,252,0.4); background: rgba(45,225,252,0.15); color: #fff; font-family: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.jarvis-settings-status { font-size: 11px; color: var(--jarvis-cyan); min-height: 14px; }
.jarvis-toggle { position: relative; width: 38px; height: 22px; border-radius: 999px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); cursor: pointer; flex-shrink: 0; transition: background 0.2s ease, border-color 0.2s ease; }
.jarvis-toggle-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s ease; }
.jarvis-toggle.on { background: var(--jarvis-cyan); border-color: var(--jarvis-cyan); }
.jarvis-toggle.on .jarvis-toggle-knob { transform: translateX(16px); }
.jarvis-wake-indicator {
  position: absolute; inset: -8%; border-radius: 50%; pointer-events: none; opacity: 0; z-index: 0;
  border: 1.5px solid var(--jarvis-cyan); transition: opacity 0.3s ease;
  animation: jarvis-wake-breathe 2.6s ease-in-out infinite;
}
.jarvis-wake-indicator.on { opacity: 0.55; }
@keyframes jarvis-wake-breathe { 0%, 100% { transform: scale(1); opacity: 0.35; } 50% { transform: scale(1.06); opacity: 0.7; } }

.jarvis-feed { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; margin-bottom: 14px; padding-right: 2px; flex: 1; min-height: 120px; max-height: 46vh; }
.jarvis-msg { max-width: 88%; font-size: 13.5px; line-height: 1.55; }
.jarvis-msg.user { align-self: flex-end; }
.jarvis-msg.jarvis { align-self: flex-start; width: 100%; }
.jarvis-bubble { border-radius: 14px; padding: 11px 14px; }
.jarvis-msg.user .jarvis-bubble { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); color: #fff; }
.jarvis-msg.jarvis .jarvis-bubble { background: rgba(45,225,252,0.05); border: 1px solid rgba(45,225,252,0.3); border-left: 3px solid var(--jarvis-cyan); color: rgba(255,255,255,0.85); }
.jarvis-msg.jarvis .jarvis-bubble b { color: #fff; }
.jarvis-msg .jarvis-action-note { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 5px 10px; border-radius: 999px; background: rgba(107,227,164,0.12); border: 1px solid rgba(107,227,164,0.35); color: #6BE3A4; font-size: 11.5px; font-weight: 700; }
.jarvis-msg ul { margin: 6px 0 0; padding-left: 18px; }
.jarvis-key-row { display: none; gap: 8px; margin-bottom: 12px; }
.jarvis-key-row.show { display: flex; }
.jarvis-key-row input { flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.3); color: #fff; font-family: inherit; font-size: 12.5px; outline: none; }
.jarvis-key-row button { border: 0; border-radius: 10px; padding: 0 16px; cursor: pointer; color: #06282e; background: var(--jarvis-cyan); font-weight: 700; font-size: 12.5px; white-space: nowrap; }
.jarvis-composer { display: flex; gap: 8px; align-items: center; }
.jarvis-composer input { flex: 1; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.3); color: #fff; font-family: inherit; font-size: 13.5px; outline: none; }
.jarvis-composer input:focus { border-color: rgba(45,225,252,0.5); }
.jarvis-mic-btn, .jarvis-send-btn {
  width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.7); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.jarvis-mic-btn svg, .jarvis-send-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.jarvis-mic-btn:hover, .jarvis-send-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.jarvis-mic-btn.active { color: #06282e; border-color: var(--jarvis-cyan); background: var(--jarvis-cyan); animation: jarvis-mic-pulse 1.1s ease-in-out infinite; }
@keyframes jarvis-mic-pulse { 0%,100% { box-shadow: 0 0 0 rgba(45,225,252,0); } 50% { box-shadow: 0 0 0 7px rgba(45,225,252,0.25); } }
.jarvis-voice-hint { font-size: 10.5px; color: rgba(255,255,255,0.35); margin-top: 8px; text-align: center; min-height: 13px; }
.jarvis-dots { display: inline-flex; gap: 4px; }
.jarvis-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--jarvis-cyan); opacity: 0.4; animation: jarvis-dot 1.2s ease-in-out infinite; }
.jarvis-dots i:nth-child(2) { animation-delay: 0.2s; } .jarvis-dots i:nth-child(3) { animation-delay: 0.4s; }
.jarvis-cursor { display: inline-block; width: 7px; height: 1em; margin-left: 2px; vertical-align: -2px; background: var(--jarvis-cyan); animation: jarvis-blink 0.9s step-end infinite; }
@keyframes jarvis-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
@keyframes jarvis-dot { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }
@media (max-width: 480px) { .jarvis-modal { padding: 16px; } }
`;
  const styleEl = document.createElement('style');
  styleEl.id = 'jarvis-style';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const FACE_HTML = '<canvas class="jarvis-face-canvas"></canvas>';

  /* ---------- Inject FAB if this page has no hero orb of its own ---------- */
  if (!$('jarvisCore')) {
    const fab = document.createElement('div');
    fab.innerHTML =
      '<div class="jarvis-core jarvis-fab" id="jarvisCore" role="button" tabindex="0" aria-label="Talk to Jarvis">' +
        '<div class="jarvis-wake-indicator"></div>' +
        '<div class="jarvis-ring-ticks"></div>' +
        '<div class="jarvis-ring-sweep"></div>' +
        '<svg class="jarvis-core-icon" viewBox="0 0 24 24"><path d="M12 2.5c.6 3.4 1.4 5.6 2.7 6.9 1.3 1.3 3.5 2.1 6.8 2.6-3.3.6-5.5 1.4-6.8 2.7-1.3 1.3-2.1 3.5-2.7 6.8-.6-3.3-1.4-5.5-2.7-6.8-1.3-1.3-3.5-2.1-6.8-2.7 3.3-.5 5.5-1.3 6.8-2.6C10.6 8.1 11.4 5.9 12 2.5Z" fill="#06282e"/></svg>' +
        FACE_HTML +
      '</div>';
    document.body.appendChild(fab.firstChild);
  } else {
    // Hero orb already exists (index.html) — give it the same ring decoration.
    const core = $('jarvisCore');
    if (!core.querySelector('.jarvis-ring-sweep')) {
      const wake = document.createElement('div'); wake.className = 'jarvis-wake-indicator';
      const ticks = document.createElement('div'); ticks.className = 'jarvis-ring-ticks';
      const sweep = document.createElement('div'); sweep.className = 'jarvis-ring-sweep';
      core.insertBefore(sweep, core.firstChild);
      core.insertBefore(ticks, core.firstChild);
      core.insertBefore(wake, core.firstChild);
    }
    if (!core.querySelector('.jarvis-face-canvas')) {
      const face = document.createElement('div');
      face.innerHTML = FACE_HTML;
      core.appendChild(face.firstChild);
    }
  }

  /* ---------- Hologram face draw loop ----------
     A stylized wireframe/constellation face: a handful of facial landmark
     points (brow/eye/nose/mouth/jaw, normalized 0–1 within a face box) drawn
     as glowing nodes, with nearby points auto-connected by faint lines —
     the same "connect what's close" trick as a particle-network effect,
     which naturally produces mesh density around the features without
     hand-authoring a full triangulation. Runs once per orb (hero + FAB both
     get their own canvas + loop) but only actually draws while the orb has
     .voice-active, so it costs nothing the rest of the time. */
  const FACE_LANDMARKS = [
    // face oval (20 pts)
    [0.50,0.04],[0.61,0.06],[0.71,0.11],[0.79,0.19],[0.85,0.29],[0.88,0.40],[0.89,0.50],
    [0.88,0.60],[0.85,0.71],[0.79,0.81],[0.71,0.89],[0.61,0.94],[0.50,0.96],
    [0.39,0.94],[0.29,0.89],[0.21,0.81],[0.15,0.71],[0.12,0.60],[0.11,0.50],[0.12,0.40],
    [0.15,0.29],[0.21,0.19],[0.29,0.11],[0.39,0.06],
    // brows
    [0.26,0.35],[0.31,0.32],[0.37,0.31],[0.43,0.33],
    [0.57,0.33],[0.63,0.31],[0.69,0.32],[0.74,0.35],
    // eyes
    [0.27,0.42],[0.32,0.40],[0.38,0.40],[0.42,0.43],[0.38,0.45],[0.32,0.45],
    [0.58,0.43],[0.62,0.40],[0.68,0.40],[0.73,0.42],[0.68,0.45],[0.62,0.45],
    // nose
    [0.50,0.44],[0.49,0.53],[0.47,0.61],[0.43,0.64],[0.50,0.66],[0.57,0.64],
    // mouth (outer then inner)
    [0.34,0.76],[0.41,0.73],[0.50,0.72],[0.59,0.73],[0.66,0.76],[0.59,0.81],[0.50,0.83],[0.41,0.81],
    [0.41,0.76],[0.50,0.76],[0.59,0.76],[0.50,0.78],
    // jaw/ears hint
    [0.10,0.45],[0.90,0.45],
  ];
  const MOUTH_START = 50; // index into FACE_LANDMARKS where the mouth points begin (24 oval + 8 brow + 12 eye + 6 nose)
  const MOUTH_COUNT = 12;
  function startFaceCanvas(core) {
    const canvas = core.querySelector('.jarvis-face-canvas');
    if (!canvas || !canvas.getContext || canvas.__jarvisFaceStarted) return;
    canvas.__jarvisFaceStarted = true;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const r = core.getBoundingClientRect();
      w = r.width; h = r.height;
      if (!w || !h) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    let t = 0;
    const FACE_COLOR = '#06282e';
    function draw() {
      requestAnimationFrame(draw);
      const active = core.classList.contains('voice-active');
      if (!active) { if (w && h) ctx.clearRect(0, 0, w, h); return; }
      if (!w || !h) { resize(); if (!w || !h) return; }
      t++;
      ctx.clearRect(0, 0, w, h);
      const box = Math.min(w, h) * 0.62;
      const ox = (w - box) / 2, oy = (h - box) / 2 - box * 0.03;
      const speaking = core.classList.contains('speaking');
      const thinking = core.classList.contains('thinking');
      // Talking mouth: pseudo-random-but-smooth openness while speaking,
      // settles flat otherwise. Thinking gets a slower, subtler "considering"
      // brow/mouth drift instead of a flat neutral face.
      const talk = speaking ? (0.3 + 0.7 * Math.abs(Math.sin(t * 0.22) * 0.6 + Math.sin(t * 0.09) * 0.4)) : 0;
      const think = thinking ? Math.sin(t * 0.04) * 0.5 + 0.5 : 0;
      const pts = FACE_LANDMARKS.map((p, i) => {
        let x = p[0], y = p[1];
        // Idle "alive" breathing jitter, tiny, on every point.
        x += Math.sin(t * 0.02 + i) * 0.003;
        y += Math.cos(t * 0.023 + i * 1.3) * 0.003;
        if (i >= MOUTH_START && i < MOUTH_START + MOUTH_COUNT) {
          // Push the lower mouth points down and upper ones up slightly to
          // open the mouth while talking, proportional to vertical position
          // within the mouth group (top lip vs bottom lip).
          const localY = p[1] - FACE_LANDMARKS[MOUTH_START + 2][1];
          y += (localY > 0 ? 1 : -1) * talk * 0.05;
        }
        if (thinking && (i === 25 || i === 26 || i === 28 || i === 29)) {
          y -= think * 0.02; // one brow lifts slightly while "considering"
        }
        return [ox + x * box, oy + y * box];
      });
      // Mesh lines: connect points within a distance threshold (scaled to
      // box size) — concentrates naturally around dense feature clusters.
      const LINK = box * 0.11;
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.globalAlpha = (1 - d / LINK) * 0.55;
            ctx.strokeStyle = FACE_COLOR;
            ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = FACE_COLOR;
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], box * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(draw);
  }
  startFaceCanvas($('jarvisCore'));

  /* ---------- Inject chat modal ---------- */
  const modalWrap = document.createElement('div');
  modalWrap.innerHTML = `
<div class="jarvis-modal-bg" id="jarvisBg">
  <div class="jarvis-modal" role="dialog" aria-label="Jarvis">
    <div class="jarvis-modal-head">
      <span class="jarvis-modal-title"><span class="dot"></span>Jarvis</span>
      <div class="jarvis-head-btns">
        <button class="jarvis-icon-btn" id="jarvisSettingsToggle" type="button" aria-label="Jarvis settings">⚙</button>
        <button class="jarvis-icon-btn" id="jarvisClose" type="button" aria-label="Close">×</button>
      </div>
    </div>

    <div class="jarvis-settings" id="jarvisSettings">
      <label style="display:flex;align-items:center;justify-content:space-between;text-transform:none;font-size:12.5px;color:#fff;font-weight:600">
        Always listen for "Jarvis"
        <span class="jarvis-toggle" id="jarvisWakeToggle" role="switch" aria-checked="false"><span class="jarvis-toggle-knob"></span></span>
      </label>
      <small>Keeps the mic on in the background on every page and wakes him the moment you say his name — like Alexa or Siri. Needs one-time mic permission.</small>
      <label style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;text-transform:none;font-size:12.5px;color:#fff;font-weight:600">
        Natural cloud voice
        <span class="jarvis-toggle" id="jarvisVoiceToggle" role="switch" aria-checked="true"><span class="jarvis-toggle-knob"></span></span>
      </label>
      <small>Free, no signup needed — but it's one fixed voice/accent. For the calm-British-AI "Jarvis" feel, turn this OFF and install a British voice: Windows Settings → Time &amp; Language → Speech → Manage voices → add "English (United Kingdom)". He'll pick the best natural one automatically.</small>
      <label style="margin-top:6px">Notes for Jarvis</label>
      <textarea id="jarvisNotesInput" rows="2" placeholder="Anything you want Jarvis to always know…"></textarea>
      <button class="jarvis-settings-save" id="jarvisSettingsSave" type="button">Save</button>
      <div class="jarvis-settings-status" id="jarvisSettingsStatus"></div>
    </div>

    <div class="jarvis-feed" id="jarvisFeed"></div>

    <div class="jarvis-key-row" id="jarvisKeyRow">
      <input id="jarvisKeyInput" type="password" placeholder="paste your free OpenRouter API key (sk-or-…)" autocomplete="off">
      <button id="jarvisKeySave" type="button">Save</button>
    </div>

    <div class="jarvis-composer">
      <button class="jarvis-mic-btn" id="jarvisMicBtn" type="button" aria-label="Speak to Jarvis">
        <svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></svg>
      </button>
      <input id="jarvisInput" type="text" placeholder="Ask Jarvis anything — or tell him what you ate…" autocomplete="off">
      <button class="jarvis-send-btn" id="jarvisSendBtn" type="button" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
      </button>
    </div>
    <div class="jarvis-voice-hint" id="jarvisVoiceHint"></div>
  </div>
</div>`;
  document.body.appendChild(modalWrap.firstElementChild);

  /* ---------- Keys & notes ---------- */
  const OR_KEY = 'nova_lite_api_key';
  const VOICE_KEY = 'jarvis_cloud_voice_enabled';
  const NOTES_KEY = 'jarvis_notes_v1';
  const WHOOP_KEY = 'whoop_tokens_v1';

  function cleanKey(v, storeKey) {
    if (typeof v !== 'string' || v.length < 2) return v;
    if (v[0] === '"' && v[v.length - 1] === '"') {
      let cleaned; try { cleaned = JSON.parse(v); } catch (e) { cleaned = v.slice(1, -1); }
      if (typeof cleaned === 'string' && storeKey) { try { localStorage.setItem(storeKey, cleaned); } catch (e) {} }
      return cleaned;
    }
    return v;
  }
  function orKey() { try { return cleanKey(localStorage.getItem(OR_KEY) || '', OR_KEY); } catch (e) { return ''; } }
  function cloudVoiceEnabled() { try { const v = localStorage.getItem(VOICE_KEY); return v === null ? true : v === '1'; } catch (e) { return true; } }
  function setVoiceToggleUI(on) {
    const t = $('jarvisVoiceToggle');
    if (!t) return;
    t.classList.toggle('on', on);
    t.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  function notes() { try { return localStorage.getItem(NOTES_KEY) || ''; } catch (e) { return ''; } }

  $('jarvisSettingsToggle').addEventListener('click', () => {
    $('jarvisNotesInput').value = notes();
    setWakeToggleUI(wakeEnabled);
    setVoiceToggleUI(cloudVoiceEnabled());
    $('jarvisSettings').classList.toggle('show');
  });
  $('jarvisVoiceToggle').addEventListener('click', () => {
    const next = !cloudVoiceEnabled();
    try { localStorage.setItem(VOICE_KEY, next ? '1' : '0'); } catch (e) {}
    setVoiceToggleUI(next);
  });
  $('jarvisSettingsSave').addEventListener('click', () => {
    try {
      localStorage.setItem(NOTES_KEY, $('jarvisNotesInput').value);
    } catch (e) {}
    const s = $('jarvisSettingsStatus'); s.textContent = 'Saved.'; setTimeout(() => { s.textContent = ''; }, 1800);
  });
  $('jarvisKeySave').addEventListener('click', () => {
    const k = $('jarvisKeyInput').value.trim();
    if (!k) return;
    try { localStorage.setItem(OR_KEY, k); } catch (e) {}
    $('jarvisKeyInput').value = '';
    $('jarvisKeyRow').classList.remove('show');
  });

  /* ---------- Generic Supabase client (read-only lookups) ---------- */
  function supa() {
    if (!window.supabase) return null;
    const url = window.DASH_SUPABASE_URL || 'https://srajryooffirbroltjmg.supabase.co';
    const key = window.DASH_SUPABASE_KEY || 'sb_publishable_5142ZwTLF_DkSVRzciNuRA_bHwRAu4c';
    try { return window.supabase.createClient(url, key); } catch (e) { return null; }
  }

  /* ---------- WHOOP: self-sufficient snapshot (pull latest token, refresh if needed, fetch today's numbers) ---------- */
  async function pullWhoopTokenFromCloud() {
    const s = supa(); if (!s) return false;
    try {
      const { data } = await s.from('app_state').select('data').eq('key', 'health').maybeSingle();
      const remote = data && data.data && data.data.whoop_tokens_v1;
      if (!remote || !remote.access) return false;
      let local = null; try { local = JSON.parse(localStorage.getItem(WHOOP_KEY)); } catch (e) {}
      if (local && local.expires && remote.expires && local.expires >= remote.expires) return false;
      localStorage.setItem(WHOOP_KEY, JSON.stringify(remote));
      return true;
    } catch (e) { return false; }
  }
  async function refreshWhoop(t) {
    if (!t.refresh) return null;
    try {
      const r = await fetch('/api/whoop-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh }) });
      const j = await r.json();
      if (j.access_token) {
        const n = { access: j.access_token, refresh: j.refresh_token || t.refresh, expires: Date.now() + (j.expires_in || 3500) * 1000 };
        localStorage.setItem(WHOOP_KEY, JSON.stringify(n));
        return n;
      }
    } catch (e) {}
    return null;
  }
  async function whFetch(path, t) {
    const [p, qs] = path.split('?');
    const params = new URLSearchParams(qs || ''); params.set('path', p);
    const r = await fetch('/api/whoop-data?' + params.toString(), { headers: { Authorization: 'Bearer ' + t.access, Accept: 'application/json' } });
    if (!r.ok) throw new Error('whoop ' + r.status);
    return r.json();
  }
  let whoopSnapshotCache = null;
  async function whoopSnapshot() {
    if (whoopSnapshotCache) return whoopSnapshotCache;
    let t = null; try { t = JSON.parse(localStorage.getItem(WHOOP_KEY)); } catch (e) {}
    if (!t || !t.access) { if (await pullWhoopTokenFromCloud()) { try { t = JSON.parse(localStorage.getItem(WHOOP_KEY)); } catch (e) {} } }
    if (!t || !t.access) return null;
    if (t.expires && Date.now() > t.expires - 60000) {
      if (await pullWhoopTokenFromCloud()) { try { t = JSON.parse(localStorage.getItem(WHOOP_KEY)); } catch (e) {} }
      else { const n = await refreshWhoop(t); if (n) t = n; else return null; }
    }
    try {
      const [rec, sleep, cycle] = await Promise.all([
        whFetch('/recovery?limit=1', t).catch(() => null),
        whFetch('/activity/sleep?limit=1', t).catch(() => null),
        whFetch('/cycle?limit=1', t).catch(() => null),
      ]);
      const r0 = rec && rec.records && rec.records[0];
      const s0 = sleep && sleep.records && sleep.records[0];
      const c0 = cycle && cycle.records && cycle.records[0];
      whoopSnapshotCache = {
        recovery: r0 && r0.score && r0.score.recovery_score != null ? Math.round(r0.score.recovery_score) : null,
        hrv: r0 && r0.score && r0.score.hrv_rmssd_milli != null ? Math.round(r0.score.hrv_rmssd_milli) : null,
        restingHr: r0 && r0.score && r0.score.resting_heart_rate != null ? Math.round(r0.score.resting_heart_rate) : null,
        sleepPerformance: s0 && s0.score && s0.score.sleep_performance_percentage != null ? Math.round(s0.score.sleep_performance_percentage) : null,
        strain: c0 && c0.score && c0.score.strain != null ? Math.round(c0.score.strain * 10) / 10 : null,
      };
      return whoopSnapshotCache;
    } catch (e) { return null; }
  }

  /* ---------- Context for the LLM ---------- */
  async function loadGymData() {
    const s = supa();
    if (s) {
      try {
        const { data } = await s.from('app_state').select('data').eq('key', 'po-coach').maybeSingle();
        if (data && data.data && data.data.po_coach_v1) return data.data.po_coach_v1;
      } catch (e) {}
    }
    return loadJSON('po_coach_v1', null);
  }
  function dateKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Same 6am-rollover "active day" the goals/stack features already use
  // (topbar.js) — a supplement or goal logged at 1am still counts as
  // "yesterday" there, so Jarvis needs to agree with that, not calendar midnight.
  function activeDateKey() {
    const now = new Date();
    const d = new Date(now);
    if (now.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Weather isn't in localStorage anywhere — Main only keeps it in a page
  // variable — so Jarvis does its own quick fetch, reusing whatever
  // location Main already saved (geo_pos_v1) rather than asking for
  // location permission itself. No cached location yet = no weather, same
  // as any other "hasn't been set up" data source.
  async function fetchWeatherSnapshot() {
    let geo = null; try { geo = JSON.parse(localStorage.getItem('geo_pos_v1')); } catch (e) {}
    if (!geo || geo.lat == null) return null;
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lon +
        '&current=temperature_2m,precipitation,weather_code,wind_speed_10m' +
        '&daily=precipitation_probability_max,uv_index_max,sunset&timezone=auto';
      const r = await fetch(url);
      const j = await r.json();
      const cur = j.current || {}, daily = j.daily || {};
      return {
        tempC: cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null,
        isRainingNow: (cur.precipitation || 0) > 0,
        windKmh: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
        uvMax: (daily.uv_index_max && daily.uv_index_max[0] != null) ? Math.round(daily.uv_index_max[0]) : null,
        rainChancePct: (daily.precipitation_probability_max && daily.precipitation_probability_max[0] != null) ? daily.precipitation_probability_max[0] : null,
        sunset: (daily.sunset && daily.sunset[0]) || null,
        location: geo.label || null,
      };
    } catch (e) { return null; }
  }

  // Recent sets only, not the whole lifetime log — dumping months of history
  // into every request bloats the prompt and adds real, measurable latency
  // for no benefit (Jarvis only ever gets asked about "recent" workouts).
  function recentGymLogs(gym, limit) {
    if (!gym || !gym.logs) return [];
    const all = [];
    Object.keys(gym.logs).forEach((exId) => {
      const ex = (gym.exercises || []).find((e) => e.id === exId);
      (gym.logs[exId] || []).forEach((l) => all.push(Object.assign({ exercise: ex ? ex.name : exId }, l)));
    });
    all.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return all.slice(0, limit);
  }

  async function buildContext() {
    const profile = loadJSON('user_profile_v1', {});
    const nutrition = loadJSON('nutrition:v1', null);
    const sun = loadJSON('sun_tracker_v1', null);
    // Independent network/Supabase lookups — run them together instead of
    // one after another, which used to add their latencies on top of each
    // other before the OpenRouter call even started.
    const [gym, whoop, weather] = await Promise.all([loadGymData(), whoopSnapshot(), fetchWeatherSnapshot()]);

    const ad = activeDateKey();
    const stackItems = loadJSON('stack:items', []);
    const stackTaken = loadJSON('stack:taken:' + ad, {});
    const supplements = Array.isArray(stackItems) && stackItems.length
      ? stackItems.map((it) => ({ name: it && it.name, taken: !!(it && stackTaken[it.id]) }))
      : null;

    const goals = loadJSON('goals:' + ad, []);

    const cafLogs = loadJSON('caf:logs', []);
    const todayStartMs = new Date(new Date().toDateString()).getTime();
    const caffeineMgToday = Array.isArray(cafLogs)
      ? cafLogs.filter((l) => l && l.ts >= todayStartMs).reduce((sum, l) => sum + (+l.mg || 0), 0)
      : null;

    const nwHistory = loadJSON('nw:history', []);
    const netWorth = Array.isArray(nwHistory) && nwHistory.length ? nwHistory[nwHistory.length - 1].v : null;

    const ctx = {
      today: new Date().toString(),
      profile,
      whoop: whoop || 'not connected or no data synced yet',
      weather: weather || 'not available — no location saved on this device yet (set it on the Main page)',
      nutritionToday: nutrition && nutrition.logs ? (nutrition.logs[dateKey()] || []) : null,
      sunAndSteps: sun,
      gym: gym ? { days: gym.days, recentLogs: recentGymLogs(gym, 15) } : 'not logged yet',
      supplementsToday: supplements || 'none configured',
      goalsToday: Array.isArray(goals) && goals.length ? goals : 'none set today',
      caffeineMgToday: caffeineMgToday != null ? caffeineMgToday : 'not tracked',
      netWorth: netWorth != null ? netWorth : 'not tracked',
      userNotes: notes() || null,
    };
    return JSON.stringify(ctx);
  }

  const MICRO_KEYS = ['fiber', 'sodium', 'potassium', 'calcium', 'iron', 'vitaminC', 'vitaminA', 'vitaminD', 'vitaminB12', 'magnesium', 'zinc', 'folate'];
  function addFoodToNutrition(entry) {
    try {
      const state = loadJSON('nutrition:v1', { logs: {} });
      state.logs = state.logs || {};
      const k = dateKey();
      const list = state.logs[k] || [];
      const zeros = {}; MICRO_KEYS.forEach((mk) => { zeros[mk] = 0; });
      const clean = Object.assign({ id: Date.now() + Math.random(), name: entry.name || 'Logged via Jarvis', calories: 0, protein: 0, carbs: 0, fat: 0 }, zeros);
      ['name'].forEach((f) => { if (entry[f] != null) clean[f] = entry[f]; });
      ['calories', 'protein', 'carbs', 'fat'].forEach((f) => { clean[f] = Math.round(+entry[f] || 0); });
      MICRO_KEYS.forEach((mk) => { clean[mk] = Math.round((+entry[mk] || 0) * 10) / 10; });
      list.push(clean);
      state.logs[k] = list;
      saveJSON('nutrition:v1', state);
      // If Jarvis was opened from nutrition.html itself, refresh its view
      // immediately instead of leaving it showing stale data until reload.
      if (typeof window.__nutritionRerender === 'function') { try { window.__nutritionRerender(); } catch (e) {} }
      return clean;
    } catch (e) { return null; }
  }

  const SYS = "You are Jarvis, a witty, sharp, unflappable AI assistant living inside the user's personal life-tracking " +
    "dashboard — think Tony Stark's Jarvis, but for health, fitness, nutrition, and finance instead of a suit of armor. " +
    "You can see everything this dashboard has already recorded: WHOOP recovery/sleep/strain, today's weather and UV " +
    "at the user's saved location, nutrition logs, gym training data, sun/steps/vitamin D, today's supplement/stack " +
    "checklist, today's goals, today's caffeine intake, net worth, and any notes the user left for you. If a field says " +
    "it isn't tracked or set up yet, say so plainly rather than guessing. You do NOT have access to their " +
    "conversations with any other AI assistant (including Claude) — only what's listed below.\n" +
    "Answer style — this matters: be direct. Lead with the actual answer in the first sentence, not a preamble, " +
    "not a restatement of the question, not a disclaimer. Default to 1–3 sentences; only go longer if the user " +
    "asked for detail or a list genuinely helps. Reference specific numbers from the data when relevant instead of " +
    "vague language. Talk like a sharp, calm personal assistant having a real conversation, not a report generator — " +
    "plain flowing sentences, not bullet-heavy unless listing multiple distinct items. Never hedge with " +
    "\"it seems\"/\"it looks like\" when the data just says it. Keep a calm, capable, faintly dry tone.\n" +
    "If, and only if, the user is telling you they ate or drank something and wants it logged, estimate its full " +
    "nutrition and append EXACTLY ONE block in this format at the very end of your reply, after your normal answer, " +
    "with nothing after it: <<<ADD_FOOD>>>{\"name\":\"short label\",\"calories\":N,\"protein\":N,\"carbs\":N,\"fat\":N," +
    "\"fiber\":N,\"sodium\":N,\"potassium\":N,\"calcium\":N,\"iron\":N,\"vitaminC\":N,\"vitaminA\":N,\"vitaminD\":N," +
    "\"vitaminB12\":N,\"magnesium\":N,\"zinc\":N,\"folate\":N}<<<END>>> — calories in kcal, protein/carbs/fat/fiber/" +
    "magnesium in grams, sodium/potassium/calcium/vitaminC/zinc in mg, iron in mg, vitaminA/vitaminD/vitaminB12/folate " +
    "in micrograms. Never show this JSON block itself as visible prose — it is parsed separately and a confirmation " +
    "is shown automatically. Never include it unless the user actually wants something logged.\n" +
    "Dashboard data as JSON:\n";

  // A bigger, sharper model tried first for quality; the smaller/faster ones
  // stay as fallbacks for reliability if it's rate-limited or unavailable.
  // Deliberately NOT using a "-reasoning"-suffixed or gpt-oss model here —
  // those burn hidden thinking tokens before answering, which was already
  // tried and reverted for the nutrition estimator for being slow/flaky.
  const MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3-nano-30b-a3b:free'];

  /* ---------- Chat rendering ---------- */
  let messages = [];
  let busy = false;
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function format(text) {
    let h = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const lines = h.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = [], loose = [];
    lines.forEach((l) => { if (/^[-•*]\s+/.test(l)) items.push('<li>' + l.replace(/^[-•*]\s+/, '') + '</li>'); else loose.push(l); });
    let out = loose.join('<br>');
    if (items.length) out += (out ? '<br>' : '') + '<ul>' + items.join('') + '</ul>';
    return out;
  }
  function render() {
    const feed = $('jarvisFeed');
    feed.innerHTML = messages.map((m) => {
      const cls = m.role === 'user' ? 'user' : 'jarvis';
      let html;
      if (m.pending && !m.text) html = '<span class="jarvis-dots"><i></i><i></i><i></i></span>';
      else {
        html = format(m.text || '');
        if (m.pending) html += '<span class="jarvis-cursor"></span>';
        if (m.actionLabel) html += '<div class="jarvis-action-note">✅ ' + esc(m.actionLabel) + '</div>';
      }
      return '<div class="jarvis-msg ' + cls + '"><div class="jarvis-bubble">' + html + '</div></div>';
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  }

  // Free browser voices range from decent to "Stephen Hawking." Chrome/Edge
  // both ship modern cloud/neural voices alongside the old robotic desktop
  // ones — Edge on Windows in particular bundles free "Online (Natural)"
  // voices — but speechSynthesis defaults to whatever the OS considers
  // voice #1, which is usually the oldest, choppiest one. Actively pick a
  // better one instead of accepting the default. Voices load asynchronously
  // (often empty on the very first call), so this re-reads the list once
  // the browser reports it's ready.
  let cachedVoices = [];
  function refreshVoiceList() { if ('speechSynthesis' in window) cachedVoices = window.speechSynthesis.getVoices(); }
  if ('speechSynthesis' in window) {
    refreshVoiceList();
    window.speechSynthesis.onvoiceschanged = refreshVoiceList;
  }
  // Biased toward a calm British male voice — the closest a free system
  // voice gets to the "Iron Man" Jarvis feel (Windows ships one as
  // "Microsoft Ryan Online (Natural) — English (United Kingdom)" once
  // installed via Settings > Time & Language > Speech > Manage voices).
  // This can't and doesn't try to clone the actual movie character's voice
  // (Paul Bettany's copyrighted performance) — it just prefers whatever
  // real British-male-sounding free voice the OS already offers.
  const JARVIS_NAME_HINTS = /ryan|george|daniel|arthur|oliver|thomas|male/i;
  function pickBestVoice() {
    if (!cachedVoices.length) return null;
    const pool = cachedVoices.filter((v) => /^en/i.test(v.lang));
    const candidates = pool.length ? pool : cachedVoices;
    const rank = [
      (v) => /GB/i.test(v.lang) && /natural|neural|online/i.test(v.name) && JARVIS_NAME_HINTS.test(v.name),
      (v) => /GB/i.test(v.lang) && /natural|neural|online/i.test(v.name),
      (v) => /GB/i.test(v.lang) && JARVIS_NAME_HINTS.test(v.name),
      (v) => /GB/i.test(v.lang),
      (v) => /natural/i.test(v.name),
      (v) => /neural/i.test(v.name),
      (v) => /online/i.test(v.name),
      (v) => /google/i.test(v.name),
    ];
    for (const test of rank) { const found = candidates.find(test); if (found) return found; }
    return candidates[0];
  }
  function chunkForCloudTTS(text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    const chunks = [];
    let rest = clean;
    while (rest.length) {
      if (rest.length <= 180) { chunks.push(rest); break; }
      let cut = rest.lastIndexOf('. ', 180);
      if (cut < 40) cut = rest.lastIndexOf(' ', 180);
      if (cut < 40) cut = 180;
      chunks.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    return chunks.filter(Boolean);
  }
  function cloudTTSUrl(text) {
    return 'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=' + encodeURIComponent(text);
  }

  // Speech is a queue, not a one-shot call — during a streaming reply we
  // enqueue each finished sentence as it arrives (see ask()) so playback
  // starts almost immediately instead of waiting for the whole reply, and
  // still sounds like one continuous voice instead of overlapping clips.
  // The next cloud clip is preloaded while the current one plays so there's
  // no dead-air gap between chunks — that gap is what made the old
  // chunk-at-a-time playback sound choppy.
  let speechQueue = [];
  let speechPlaying = false;
  let currentAudio = null;
  let preloadedNext = null;
  // Fires once, the next time the speech queue empties naturally (not on an
  // interruption) — used to drop the voice-active UI only once Jarvis has
  // actually finished saying his reply, not the instant the text arrives.
  let onQueueDrained = null;
  function stopSpeaking() {
    speechQueue = [];
    speechPlaying = false;
    onQueueDrained = null;
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('speaking'));
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    if (preloadedNext) { try { preloadedNext.src = ''; } catch (e) {} preloadedNext = null; }
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  function speakBrowserOne(text, onDone) {
    if (!('speechSynthesis' in window)) { onDone(); return; }
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickBestVoice();
      if (v) u.voice = v;
      // Slightly slower and deeper than a neutral default — closer to
      // Jarvis's unhurried, measured cadence than a typical assistant voice.
      u.rate = 0.94; u.pitch = 0.85;
      u.onend = onDone; u.onerror = onDone;
      window.speechSynthesis.speak(u);
    } catch (e) { onDone(); }
  }
  function pumpSpeechQueue() {
    if (speechPlaying) return;
    const next = speechQueue.shift();
    if (!next) {
      document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('speaking'));
      if (onQueueDrained) { const cb = onQueueDrained; onQueueDrained = null; cb(); }
      return;
    }
    speechPlaying = true;
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.add('speaking'));
    if (cloudVoiceEnabled()) {
      const audio = preloadedNext && preloadedNext.__text === next ? preloadedNext : new Audio(cloudTTSUrl(next));
      preloadedNext = null;
      currentAudio = audio;
      const advance = () => {
        speechPlaying = false; currentAudio = null;
        if (speechQueue.length) {
          preloadedNext = new Audio(cloudTTSUrl(speechQueue[0]));
          preloadedNext.__text = speechQueue[0];
          preloadedNext.preload = 'auto';
        }
        pumpSpeechQueue();
      };
      audio.addEventListener('ended', advance);
      audio.addEventListener('error', () => { speakBrowserOne(next, advance); });
      audio.play().catch(() => { speakBrowserOne(next, advance); });
    } else {
      speakBrowserOne(next, () => { speechPlaying = false; pumpSpeechQueue(); });
    }
  }
  function enqueueSpeech(text) {
    const plain = String(text || '').replace(/\*\*/g, '').replace(/[-•*]\s+/g, '').trim();
    if (!plain) return;
    const chunks = cloudVoiceEnabled() ? chunkForCloudTTS(plain) : [plain];
    chunks.forEach((c) => speechQueue.push(c));
    pumpSpeechQueue();
  }
  function speak(text) {
    stopSpeaking();
    enqueueSpeech(text);
  }

  function extractAddFood(text) {
    const m = text.match(/<<<ADD_FOOD>>>([\s\S]*?)<<<END>>>/);
    if (!m) return { clean: text, action: null };
    const clean = text.slice(0, m.index).trim();
    let data = null; try { data = JSON.parse(m[1]); } catch (e) {}
    return { clean, action: data };
  }

  // Streams the reply token-by-token via OpenRouter's SSE format instead of
  // waiting for the whole thing — onDelta fires as text arrives so the chat
  // bubble (and, in ask(), the voice) can start well before the full reply
  // is done generating. Throws an Error with .status/.code set on a real
  // API error (401 etc.) so callers can tell that apart from a mid-stream
  // parse hiccup, which is ignored.
  async function streamChat(model, key, ctx, text, onDelta) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      // Lower temperature than the API default — more focused, direct
      // answers instead of meandering/creative ones, which matters more
      // here than in a general-purpose chat.
      body: JSON.stringify({ model, max_tokens: 700, temperature: 0.5, stream: true, messages: [{ role: 'system', content: SYS + ctx }, { role: 'user', content: text }] }),
    });
    if (!res.ok || !res.body) {
      let errJson = null; try { errJson = await res.json(); } catch (e) {}
      const err = new Error((errJson && errJson.error && errJson.error.message) || ('HTTP ' + res.status));
      err.status = res.status; err.code = errJson && errJson.error && errJson.error.code;
      throw err;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try { json = JSON.parse(payload); } catch (e) { continue; }
        if (json.error) {
          const err = new Error(json.error.message || 'stream error');
          err.status = json.error.code;
          // Already-spoken/displayed partial content, if any — the caller
          // uses this to keep it as the final answer instead of discarding
          // it and having a retry with a different model produce a second,
          // different answer on top of what was already said out loud.
          err.partial = full;
          throw err;
        }
        const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (delta) { full += delta; onDelta(delta, full); }
      }
    }
    return full;
  }

  async function ask(text, opts) {
    opts = opts || {};
    text = (text || '').trim();
    if (!text || busy) return;
    const key = orKey();
    if (!key) {
      $('jarvisKeyRow').classList.add('show');
      if (opts.viaVoice) { enqueueSpeech("I need a free OpenRouter key first — open my settings to add one."); onQueueDrained = deactivateVoiceUI; }
      return;
    }
    busy = true;
    stopSpeaking();
    messages.push({ role: 'user', text });
    const pending = { role: 'jarvis', text: '', pending: true };
    messages.push(pending);
    render();
    $('jarvisInput').value = '';
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.add('thinking'));
    let lastRenderAt = 0;
    function throttledRender() {
      const now = Date.now();
      if (now - lastRenderAt > 70) { lastRenderAt = now; render(); }
    }
    let spokeAny = false;
    try {
      const ctx = await buildContext();
      let full = '', spokenUpTo = 0, succeeded = false, lastErr = 'Something went wrong — check your API key.', authFailed = false;
      for (const model of MODELS) {
        // A model can stream part of an answer (already spoken/displayed)
        // and then fail mid-stream — without this, the retry below would
        // silently start a second, different answer on top of the first,
        // which is exactly what "he responds twice" was: two partial/whole
        // replies stacked back to back from two different models.
        stopSpeaking();
        full = ''; spokenUpTo = 0; pending.text = ''; render();
        try {
          full = await streamChat(model, key, ctx, text, (delta, accumulated) => {
            full = accumulated;
            pending.text = full;
            throttledRender();
            // Speak completed sentences as they arrive; never speak past the
            // start of an ADD_FOOD tag (that JSON block isn't for the user's
            // ears — it's stripped from the displayed text once complete).
            const tagIdx = full.indexOf('<<<');
            const safeEnd = tagIdx === -1 ? full.length : tagIdx;
            const unspoken = full.slice(spokenUpTo, safeEnd);
            let boundary = -1;
            for (let i = unspoken.length - 1; i >= 0; i--) {
              if ('.!?'.includes(unspoken[i]) && (i === unspoken.length - 1 || /\s/.test(unspoken[i + 1]))) { boundary = i; break; }
            }
            if (boundary !== -1) {
              if (opts.viaVoice && !spokeAny) { spokeAny = true; setCaption('Speaking…'); }
              enqueueSpeech(unspoken.slice(0, boundary + 1));
              spokenUpTo += boundary + 1;
            }
          });
          succeeded = true;
          break;
        } catch (e) {
          if (e.status === 401 || e.code === 401) {
            authFailed = true;
            try { localStorage.removeItem(OR_KEY); } catch (e2) {}
            lastErr = "That OpenRouter key isn't working (missing, mistyped, or revoked) — paste a fresh free one below.";
            break;
          }
          // If this model already produced (and possibly already spoke)
          // some real content before failing, keep it as the final answer
          // instead of retrying a different model for a fresh one — a
          // retry here would produce a second, different-sounding answer
          // stacked right after whatever was already said.
          if (e.partial && e.partial.trim()) {
            full = e.partial;
            succeeded = true;
            break;
          }
          lastErr = e.message || lastErr;
        }
      }
      pending.pending = false;
      if (authFailed) { $('jarvisKeyRow').classList.add('show'); }
      if (succeeded) {
        const { clean, action } = extractAddFood(full);
        pending.text = clean || full;
        if (action && action.name) {
          const added = addFoodToNutrition(action);
          if (added) pending.actionLabel = 'Added "' + added.name + '" (' + added.calories + ' kcal) to today\'s nutrition log';
        }
        const tagIdx = full.indexOf('<<<');
        const safeEnd = tagIdx === -1 ? full.length : tagIdx;
        const remainder = full.slice(spokenUpTo, safeEnd).trim();
        if (remainder) { if (opts.viaVoice && !spokeAny) { spokeAny = true; setCaption('Speaking…'); } enqueueSpeech(remainder); }
        render();
      } else {
        pending.text = lastErr;
        render();
        if (opts.viaVoice) { spokeAny = true; enqueueSpeech(lastErr); }
      }
    } catch (e) {
      pending.pending = false;
      pending.text = 'Something went wrong on my end.';
      render();
      if (opts.viaVoice) { spokeAny = true; enqueueSpeech(pending.text); }
    }
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('thinking'));
    if (opts.viaVoice) {
      if (spokeAny) onQueueDrained = deactivateVoiceUI;
      else deactivateVoiceUI();
    }
    busy = false;
  }

  /* ---------- Voice in: click-to-talk AND always-on wake word ("Jarvis") ----------
     One shared SpeechRecognition instance, one small state machine, so the
     passive "listening for my name" mode and the active "taking your
     command" mode never fight over the microphone:
       idle    — nothing running (wake word off, no manual mic press)
       wake    — passively listening, only checking for "jarvis"
       command — actively transcribing the next thing you say as a real query

     Deliberately continuous:false, even for "always listening" — Chrome's
     continuous:true mode is known to silently stop emitting results after
     network hiccups or long silences with no reliable way to detect it.
     Instead, "always on" is simulated by immediately restarting a fresh
     short session every time one ends (onend), which is the more reliable
     pattern in practice. A short backoff + failure cap stops it from
     spinning forever if the mic is unavailable rather than erroring silently
     forever in the background. */
  const WAKE_KEY = 'jarvis_wakeword_enabled';
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Voice requires a secure context (HTTPS, or localhost) — on plain HTTP
  // (e.g. opening the dashboard via a bare LAN IP) the browser blocks
  // microphone access outright with no prompt and no catchable error, which
  // looks identical to "does nothing when I talk to it." Surface that
  // distinctly instead of failing silently.
  const secure = typeof window.isSecureContext === 'undefined' || window.isSecureContext;
  let rec = null, mode = 'idle', wakeEnabled = loadJSON(WAKE_KEY, false), pendingCommand = false, wakeFailStreak = 0;

  function setWakeIndicator(on) { document.querySelectorAll('.jarvis-wake-indicator').forEach((el) => el.classList.toggle('on', on)); }
  function setWakeToggleUI(on) {
    const t = $('jarvisWakeToggle');
    if (t) { t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); }
  }
  function setHint(text, persistent) {
    const h = $('jarvisVoiceHint');
    h.textContent = text;
    h.dataset.persistent = persistent ? '1' : '';
  }
  function clearHintUnlessPersistent() { if ($('jarvisVoiceHint').dataset.persistent !== '1') $('jarvisVoiceHint').textContent = ''; }

  // ---- Wake-word UI: saying "Jarvis" no longer opens the chat modal — it
  // stays hands-free. The orb itself becomes the whole interface: it shows a
  // small animated face, the page's own hint line (if present, e.g. the
  // Main-page caption under the orb) doubles as a live caption, and — on
  // index.html only, via CSS reacting to this class — the side cards slide
  // out of the way so he's the sole focus while a voice exchange is live.
  // (The modal still opens normally on a tap/click — this only changes the
  // voice path.)
  function setCaption(text) {
    const hint = document.querySelector('.jarvis-hint');
    if (!hint) return;
    if (hint.dataset.orig === undefined) hint.dataset.orig = hint.textContent;
    hint.textContent = text;
  }
  function restoreCaption() {
    const hint = document.querySelector('.jarvis-hint');
    if (!hint || hint.dataset.orig === undefined) return;
    hint.textContent = hint.dataset.orig;
  }
  function activateVoiceUI() {
    document.body.classList.add('jarvis-voice-active');
    document.querySelectorAll('#jarvisCore').forEach((el) => {
      el.classList.add('voice-active');
      el.classList.remove('wake-burst'); void el.offsetWidth; el.classList.add('wake-burst');
    });
    setCaption('Listening…');
  }
  function deactivateVoiceUI() {
    document.body.classList.remove('jarvis-voice-active');
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('voice-active', 'speaking', 'listening', 'thinking', 'wake-burst'));
    restoreCaption();
  }
  // A word-boundary-ish match rather than an exact "jarvis" substring — generic
  // speech-to-text regularly mangles proper nouns ("jarviss", "jarv is", a
  // trailing "jarvis," with punctuation already stripped by the API, etc.).
  const WAKE_RE = /\bjarv[a-z]*\b/i;
  function safeStart(nextMode) {
    if (!secure) { setHint('Voice needs HTTPS — open the dashboard via its https:// address.', true); return; }
    mode = nextMode;
    setWakeIndicator(mode === 'wake');
    if (mode === 'wake') setHint("Listening for \"Jarvis\"…", true);
    try { rec.start(); } catch (e) { /* a session was already active — ignore, onend will retry */ }
  }

  if (SpeechRec && secure) {
    rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      wakeFailStreak = 0;
      const said = (e.results[e.results.length - 1][0].transcript || '').trim();
      if (mode === 'wake') {
        const m = said.match(WAKE_RE);
        if (!m) { setHint('Heard: "' + said + '" (not my name)', true); return; } // keep passively listening
        const after = said.slice(m.index + m[0].length).replace(/^[,.!\s]+/, '').trim();
        activateVoiceUI();
        if (after) {
          pendingCommand = false;
          ask(after, { viaVoice: true });
        } else {
          pendingCommand = true;
          setHint("Yes? I'm listening…", true);
          document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.add('listening'));
        }
      } else if (mode === 'command') {
        $('jarvisInput').value = said;
        setHint('Heard: "' + said + '"', false);
        if (document.body.classList.contains('jarvis-voice-active')) setCaption('Thinking…');
        ask(said, { viaVoice: document.body.classList.contains('jarvis-voice-active') });
      }
    };
    rec.onend = () => {
      document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('listening'));
      $('jarvisMicBtn').classList.remove('active');
      if (pendingCommand) { pendingCommand = false; setTimeout(() => safeStart('command'), 150); return; }
      if (mode === 'command') {
        clearHintUnlessPersistent();
        mode = 'idle';
        // Command mode ended without ever calling ask() (silence, timeout) —
        // if ask() had actually started, busy would already be true and
        // deactivation is left to onQueueDrained once he's done speaking.
        if (!busy && document.body.classList.contains('jarvis-voice-active')) deactivateVoiceUI();
      }
      if (wakeEnabled) {
        if (wakeFailStreak >= 6) {
          // Something's persistently wrong (no mic, blocked permission that
          // isn't reported as 'not-allowed', etc.) — stop hammering it and
          // say so plainly instead of silently listening to nothing forever.
          wakeEnabled = false; saveJSON(WAKE_KEY, false); setWakeToggleUI(false); setWakeIndicator(false);
          setHint('Voice keeps failing to start — try toggling it off and on again.', true);
          return;
        }
        setTimeout(() => safeStart('wake'), 300);
      } else { mode = 'idle'; setWakeIndicator(false); setHint('', false); }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wakeEnabled = false; saveJSON(WAKE_KEY, false); setWakeToggleUI(false); setWakeIndicator(false);
        setHint('Microphone permission denied — check your browser/site settings.', true);
        wakeFailStreak = 0;
        if (!busy && document.body.classList.contains('jarvis-voice-active')) deactivateVoiceUI();
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        // Completely normal in wake mode (most restarts hear silence) — not a
        // real failure, don't count it against the fail streak.
      } else if (mode === 'command') {
        setHint('Could not hear you (' + e.error + ') — try again.', false);
      } else {
        wakeFailStreak++;
        setHint('Voice error: ' + e.error + ' — retrying…', true);
      }
    };
    if (wakeEnabled) safeStart('wake');
  }

  $('jarvisMicBtn').addEventListener('click', () => {
    if (!secure) { setHint('Voice needs HTTPS — open the dashboard via its https:// address.', false); return; }
    if (!rec) { setHint("This browser doesn't support voice input — try Chrome or Edge, or just type.", false); return; }
    if (mode === 'command') { try { rec.stop(); } catch (e) {} return; }
    $('jarvisMicBtn').classList.add('active');
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.add('listening'));
    setHint('Listening…', false);
    if (mode === 'wake') { pendingCommand = true; try { rec.stop(); } catch (e) {} }
    else safeStart('command');
  });

  $('jarvisWakeToggle').addEventListener('click', () => {
    if (!secure) { $('jarvisSettingsStatus').textContent = 'Voice needs HTTPS — open the dashboard via its https:// address.'; return; }
    if (!SpeechRec) { $('jarvisSettingsStatus').textContent = "This browser doesn't support voice — try Chrome or Edge."; return; }
    wakeEnabled = !wakeEnabled;
    saveJSON(WAKE_KEY, wakeEnabled);
    setWakeToggleUI(wakeEnabled);
    wakeFailStreak = 0;
    if (wakeEnabled) safeStart('wake');
    else { try { rec.stop(); } catch (e) {} mode = 'idle'; setWakeIndicator(false); setHint('', false); }
  });

  /* ---------- Open / close ---------- */
  function open() {
    $('jarvisKeyRow').classList.toggle('show', !orKey());
    if (!messages.length) {
      messages.push({ role: 'jarvis', text: "At your service. I can see your WHOOP, nutrition, training, and sun data — ask me anything, tell me what you ate, or tap the mic and talk to me." });
      render();
    }
    $('jarvisBg').classList.add('show');
    setTimeout(() => $('jarvisInput').focus(), 50);
  }
  function close() { $('jarvisBg').classList.remove('show'); if (listening) rec.stop(); }
  $('jarvisCore').addEventListener('click', open);
  $('jarvisCore').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  $('jarvisClose').addEventListener('click', close);
  $('jarvisBg').addEventListener('click', (e) => { if (e.target === $('jarvisBg')) close(); });
  $('jarvisSendBtn').addEventListener('click', () => ask($('jarvisInput').value));
  $('jarvisInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('jarvisInput').value); });
})();
