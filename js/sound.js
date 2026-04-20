'use strict';

const Sound = (() => {
  let _ctx = null;
  let enabled = true;

  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  function tone(freq, type, duration, vol, fadeStart) {
    if (!enabled) return;
    try {
      const ac = ctx();
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t = ac.currentTime;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.01);
    } catch (_) {}
  }

  function noise(duration, vol) {
    if (!enabled) return;
    try {
      const ac = ctx();
      const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * vol;
      const src  = ac.createBufferSource();
      const gain = ac.createGain();
      src.buffer = buf;
      src.connect(gain); gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      src.start();
    } catch (_) {}
  }

  return {
    toggle() { enabled = !enabled; return enabled; },
    hit: (() => { let last = 0; return () => { const now = performance.now(); if (now - last < 120) return; last = now; tone(350 + Math.random()*150, 'square', 0.07, 0.18); }; })(),
    wall()   { tone(220, 'triangle', 0.06, 0.12); },
    pocket() { tone(180, 'sine', 0.35, 0.28); setTimeout(() => tone(120, 'sine', 0.25, 0.20), 80); },
    shoot()  { noise(0.04, 0.15); },
    foul()   { tone(120, 'sawtooth', 0.4, 0.2); },
    win()    { [0,150,300].forEach(d => setTimeout(() => tone(660, 'sine', 0.25, 0.2), d)); },
  };
})();
