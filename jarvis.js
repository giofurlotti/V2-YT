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
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
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
.jarvis-core-icon { position: relative; z-index: 1; fill: #06282e; stroke: none; }
.jarvis-core-readout { position: relative; z-index: 1; font-family: var(--font-mono, monospace); font-weight: 700; color: #06282e; line-height: 1; text-align: center; }
.jarvis-core-readout .n { display: block; font-variant-numeric: tabular-nums; }
.jarvis-core-readout .l { display: block; font-size: 0.5em; letter-spacing: 0.1em; opacity: 0.75; }

/* Floating orb (every page except index.html, which has its own hero) */
.jarvis-fab {
  position: fixed; right: 18px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 90;
  width: 60px; height: 60px;
}
.jarvis-fab .jarvis-core-icon { width: 22px; height: 22px; }
.jarvis-fab .jarvis-core-readout { font-size: 9px; }

/* Hero variant (index.html) gets bigger icon/readout via its own size */
#jarvisCore:not(.jarvis-fab) .jarvis-core-icon { width: 30px; height: 30px; }
#jarvisCore:not(.jarvis-fab) .jarvis-core-readout { font-size: 15px; margin-top: 2px; }

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
@keyframes jarvis-dot { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }
@media (max-width: 480px) { .jarvis-modal { padding: 16px; } }
`;
  const styleEl = document.createElement('style');
  styleEl.id = 'jarvis-style';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Inject FAB if this page has no hero orb of its own ---------- */
  if (!$('jarvisCore')) {
    const fab = document.createElement('div');
    fab.innerHTML =
      '<div class="jarvis-core jarvis-fab" id="jarvisCore" role="button" tabindex="0" aria-label="Talk to Jarvis">' +
        '<div class="jarvis-ring-ticks"></div>' +
        '<div class="jarvis-ring-sweep"></div>' +
        '<svg class="jarvis-core-icon" viewBox="0 0 24 24"><path d="M12 2.5c.6 3.4 1.4 5.6 2.7 6.9 1.3 1.3 3.5 2.1 6.8 2.6-3.3.6-5.5 1.4-6.8 2.7-1.3 1.3-2.1 3.5-2.7 6.8-.6-3.3-1.4-5.5-2.7-6.8-1.3-1.3-3.5-2.1-6.8-2.7 3.3-.5 5.5-1.3 6.8-2.6C10.6 8.1 11.4 5.9 12 2.5Z" fill="#06282e"/></svg>' +
        '<div class="jarvis-core-readout" id="jarvisReadout" style="display:none"></div>' +
      '</div>';
    document.body.appendChild(fab.firstChild);
  } else {
    // Hero orb already exists (index.html) — give it the same ring/readout decoration.
    const core = $('jarvisCore');
    if (!core.querySelector('.jarvis-ring-sweep')) {
      const ticks = document.createElement('div'); ticks.className = 'jarvis-ring-ticks';
      const sweep = document.createElement('div'); sweep.className = 'jarvis-ring-sweep';
      core.insertBefore(sweep, core.firstChild);
      core.insertBefore(ticks, core.firstChild);
      const readout = document.createElement('div');
      readout.className = 'jarvis-core-readout'; readout.id = 'jarvisReadout'; readout.style.display = 'none';
      core.appendChild(readout);
    }
  }

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
      <label>Voice (optional)</label>
      <input id="jarvisElKeyInput" type="password" placeholder="ElevenLabs API key — free tier works" autocomplete="off">
      <input id="jarvisElVoiceInput" type="text" placeholder="Voice ID from your ElevenLabs library" autocomplete="off">
      <small>Leave blank and Jarvis still talks — he just uses your browser's built-in voice instead.</small>
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
  const EL_KEY = 'elevenlabs_api_key';
  const EL_VOICE = 'elevenlabs_voice_id';
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
  function elKey() { try { return localStorage.getItem(EL_KEY) || ''; } catch (e) { return ''; } }
  function elVoice() { try { return localStorage.getItem(EL_VOICE) || ''; } catch (e) { return ''; } }
  function notes() { try { return localStorage.getItem(NOTES_KEY) || ''; } catch (e) { return ''; } }

  $('jarvisSettingsToggle').addEventListener('click', () => {
    $('jarvisElKeyInput').value = elKey();
    $('jarvisElVoiceInput').value = elVoice();
    $('jarvisNotesInput').value = notes();
    $('jarvisSettings').classList.toggle('show');
  });
  $('jarvisSettingsSave').addEventListener('click', () => {
    try {
      localStorage.setItem(EL_KEY, $('jarvisElKeyInput').value.trim());
      localStorage.setItem(EL_VOICE, $('jarvisElVoiceInput').value.trim());
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

  function recoveryColor(rec) { if (rec >= 67) return '#6BE3A4'; if (rec >= 34) return '#F2C063'; return '#FF8A8A'; }
  async function renderLiveReadout() {
    const snap = await whoopSnapshot();
    const readout = $('jarvisReadout');
    if (!readout) return;
    if (snap && snap.recovery != null) {
      readout.style.display = '';
      readout.innerHTML = '<span class="n">' + snap.recovery + '%</span><span class="l">RECOVERY</span>';
      document.querySelectorAll('#jarvisCore').forEach((el) => {
        el.style.setProperty('--jarvis-cyan', recoveryColor(snap.recovery));
      });
    }
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
  async function buildContext() {
    const profile = loadJSON('user_profile_v1', {});
    const nutrition = loadJSON('nutrition:v1', null);
    const sun = loadJSON('sun_tracker_v1', null);
    const gym = await loadGymData();
    const whoop = await whoopSnapshot();
    const ctx = {
      today: new Date().toString(),
      profile,
      whoop: whoop || 'not connected or no data synced yet',
      nutritionToday: nutrition && nutrition.logs ? (nutrition.logs[dateKey()] || []) : null,
      sunAndSteps: sun,
      gym: gym ? { exercises: gym.exercises, days: gym.days, recentLogs: gym.logs } : 'not logged yet',
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
    "You can see everything this dashboard has already recorded: WHOOP recovery/sleep/strain, nutrition logs, gym " +
    "training data, sun/steps/vitamin D, and any notes the user left for you. You do NOT have access to their " +
    "conversations with any other AI assistant (including Claude) — only what's listed below. Answer concisely, " +
    "reference specific numbers from the data when relevant, and keep a calm, capable, faintly dry tone.\n" +
    "If, and only if, the user is telling you they ate or drank something and wants it logged, estimate its full " +
    "nutrition and append EXACTLY ONE block in this format at the very end of your reply, after your normal answer, " +
    "with nothing after it: <<<ADD_FOOD>>>{\"name\":\"short label\",\"calories\":N,\"protein\":N,\"carbs\":N,\"fat\":N," +
    "\"fiber\":N,\"sodium\":N,\"potassium\":N,\"calcium\":N,\"iron\":N,\"vitaminC\":N,\"vitaminA\":N,\"vitaminD\":N," +
    "\"vitaminB12\":N,\"magnesium\":N,\"zinc\":N,\"folate\":N}<<<END>>> — calories in kcal, protein/carbs/fat/fiber/" +
    "magnesium in grams, sodium/potassium/calcium/vitaminC/zinc in mg, iron in mg, vitaminA/vitaminD/vitaminB12/folate " +
    "in micrograms. Never show this JSON block itself as visible prose — it is parsed separately and a confirmation " +
    "is shown automatically. Never include it unless the user actually wants something logged.\n" +
    "Dashboard data as JSON:\n";

  const MODELS = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3-nano-30b-a3b:free'];

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
      if (m.pending) html = '<span class="jarvis-dots"><i></i><i></i><i></i></span>';
      else {
        html = format(m.text);
        if (m.actionLabel) html += '<div class="jarvis-action-note">✅ ' + esc(m.actionLabel) + '</div>';
      }
      return '<div class="jarvis-msg ' + cls + '"><div class="jarvis-bubble">' + html + '</div></div>';
    }).join('');
    feed.scrollTop = feed.scrollHeight;
  }

  function speakBrowser(text) {
    if (!('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; u.pitch = 0.85; window.speechSynthesis.speak(u); } catch (e) {}
  }
  function speak(text) {
    const plain = text.replace(/\*\*/g, '').replace(/[-•*]\s+/g, '');
    const key = elKey(), voice = elVoice();
    if (key && voice) {
      fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voice), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': key, accept: 'audio/mpeg' },
        body: JSON.stringify({ text: plain, model_id: 'eleven_turbo_v2_5' }),
      }).then((r) => { if (!r.ok) throw new Error('elevenlabs ' + r.status); return r.blob(); })
        .then((blob) => { const audio = new Audio(URL.createObjectURL(blob)); audio.play().catch(() => {}); })
        .catch(() => speakBrowser(plain));
    } else {
      speakBrowser(plain);
    }
  }

  function extractAddFood(text) {
    const m = text.match(/<<<ADD_FOOD>>>([\s\S]*?)<<<END>>>/);
    if (!m) return { clean: text, action: null };
    const clean = text.slice(0, m.index).trim();
    let data = null; try { data = JSON.parse(m[1]); } catch (e) {}
    return { clean, action: data };
  }

  async function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    const key = orKey();
    if (!key) { $('jarvisKeyRow').classList.add('show'); return; }
    busy = true;
    messages.push({ role: 'user', text });
    const pending = { role: 'jarvis', text: '', pending: true };
    messages.push(pending);
    render();
    $('jarvisInput').value = '';
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.add('thinking'));
    try {
      const ctx = await buildContext();
      let reply = null, lastErr = 'Something went wrong — check your API key.';
      for (const model of MODELS) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
            body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'system', content: SYS + ctx }, { role: 'user', content: text }] }),
          });
          const json = await res.json();
          if (json.error) { lastErr = json.error.message || lastErr; continue; }
          const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          if (!content) continue;
          reply = content; break;
        } catch (e) { lastErr = 'Could not reach OpenRouter — check your connection.'; }
      }
      pending.pending = false;
      if (reply) {
        const { clean, action } = extractAddFood(reply);
        pending.text = clean || reply;
        if (action && action.name) {
          const added = addFoodToNutrition(action);
          if (added) pending.actionLabel = 'Added "' + added.name + '" (' + added.calories + ' kcal) to today\'s nutrition log';
        }
        render();
        speak(pending.text);
      } else {
        pending.text = lastErr;
        render();
      }
    } catch (e) {
      pending.pending = false;
      pending.text = 'Something went wrong on my end.';
      render();
    }
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('thinking'));
    busy = false;
  }

  /* ---------- Voice in ---------- */
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  if (SpeechRec) {
    rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => { const said = e.results[0][0].transcript; $('jarvisInput').value = said; ask(said); };
    rec.onend = () => {
      listening = false;
      $('jarvisMicBtn').classList.remove('active');
      document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.remove('listening'));
      $('jarvisVoiceHint').textContent = '';
    };
    rec.onerror = (e) => { $('jarvisVoiceHint').textContent = e.error === 'not-allowed' ? 'Microphone permission denied.' : 'Could not hear you — try again.'; };
  }
  $('jarvisMicBtn').addEventListener('click', () => {
    if (!rec) { $('jarvisVoiceHint').textContent = "This browser doesn't support voice input — try Chrome or Edge, or just type."; return; }
    if (listening) { rec.stop(); return; }
    listening = true;
    $('jarvisMicBtn').classList.add('active');
    document.querySelectorAll('#jarvisCore').forEach((el) => el.classList.add('listening'));
    $('jarvisVoiceHint').textContent = 'Listening…';
    try { rec.start(); } catch (e) {}
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

  renderLiveReadout();
})();
