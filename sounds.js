// Small WebAudio-based button/link sound effects
(function(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;

  function ensureContext(){
    if (!ctx) ctx = new AudioCtx();
    return ctx;
  }

  // Unlock/resume on first user interaction to satisfy autoplay policies
  function unlockOnFirstGesture(){
    function unlock(){
      if (!ctx) ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      document.removeEventListener('pointerdown', unlock);
    }
    document.addEventListener('pointerdown', unlock, { once: true });
  }

  function playClick(type){
    const c = ensureContext();
    const now = c.currentTime;
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    const carrier = c.createOscillator();
    const buzz = c.createOscillator();

    const baseFreq = type === 'link' ? 820 : 620;
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(baseFreq, now);
    buzz.type = 'sawtooth';
    buzz.frequency.setValueAtTime(baseFreq * 1.98, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(6, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.12);

    carrier.connect(filter);
    buzz.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    const sweep = filter.frequency;
    sweep.setValueAtTime(2600, now);
    sweep.exponentialRampToValueAtTime(900, now + 0.12);

    carrier.start(now);
    buzz.start(now);
    carrier.stop(now + 0.15);
    buzz.stop(now + 0.15);
  }

  // Delegated click handler for all relevant interactive elements
  function onDocumentClick(e){
    const el = e.target.closest('a, button, [role="button"], input[type="button"], input[type="submit"]');
    if (!el) return;
    const tag = el.tagName;
    if (tag === 'A') playClick('link');
    else playClick('button');
  }

  // Initialize
  function init(){
    unlockOnFirstGesture();
    document.addEventListener('click', onDocumentClick);
  }

  // Auto-init when script loads
  init();

  // Expose for debugging if needed
  window.__buttonSounds = { playClick };
})();
