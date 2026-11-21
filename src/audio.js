// Tidewell — sound effects, music and shore ambience. All of the audio code lives here;
// main.js only calls the small hooks exported at the bottom.
//
// Every sound and all music is ORIGINAL, made in code with the Web Audio API.
// There are no audio files and no third-party audio, so nothing to download or credit.
// Each sound sits behind a name (play('splash')), so a recorded file can replace it later.
//
// Rules this file keeps:
//  - Nothing plays, and no AudioContext exists, until the player's first tap (phones block audio before that).
//  - The phone's silent switch is respected (Mac: no play-through-silent workaround).
//  - Sound pauses when the game is in the background.

var AC = window.AudioContext || window.webkitAudioContext;
var ctx = null, master, sfx, mus, noiseBuf, cur = null;   // cur: where one-shot sounds go right now
var vol = { music: 0.6, sfx: 0.8, muted: false };
var MUSIC_GAIN = 0.9, SFX_GAIN = 1.0;

function rnd(a, b) { return a + Math.random() * (b - a); }
function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function mkGain(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }

function impulse(sec) {
  var sr = ctx.sampleRate, len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
  for (var c = 0; c < 2; c++) {
    var d = b.getChannelData(c), lp = 0;
    for (var i = 0; i < len; i++) {
      var w = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      lp = lp * 0.55 + w * 0.45; d[i] = lp;
    }
  }
  return b;
}
function mkBus(v, ir) {
  var b = { in: mkGain(v, master), wet: mkGain(1) };
  var conv = ctx.createConvolver(); conv.buffer = ir;
  b.wet.connect(conv); conv.connect(mkGain(0.7, b.in));
  return b;
}

function init() {
  if (!AC) return null;
  if (ctx) return ctx;
  try { ctx = new AC(); } catch (e) { ctx = null; return null; }   // audio refused: the game carries on silently
  var comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 6;
  comp.attack.value = 0.004; comp.release.value = 0.22;
  master = mkGain(vol.muted ? 0 : 1, comp); comp.connect(ctx.destination);
  var sr = ctx.sampleRate, i, d;
  noiseBuf = ctx.createBuffer(1, sr * 2, sr); d = noiseBuf.getChannelData(0);
  for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  var ir = impulse(1.7);
  sfx = mkBus(vol.sfx * SFX_GAIN, ir);
  mus = mkBus(vol.music * MUSIC_GAIN, ir);
  return ctx;
}

// ---------- building blocks ----------
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function out(node, bus, send) {
  node.connect(bus.in);
  if (send) { var s = mkGain(send, bus.wet); node.connect(s); }
}
function tone(o) {
  var t = o.t, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || o.dur));
  env(g, t, o.a || 0.005, o.v || 0.2, o.dur);
  osc.connect(g); out(g, o.bus || cur || sfx, o.send);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}
function noise(o) {
  var t = o.t, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  fl.type = o.ft || 'bandpass'; fl.frequency.setValueAtTime(o.f, t); fl.Q.value = o.q || 0.8;
  if (o.fto) fl.frequency.exponentialRampToValueAtTime(o.fto, t + o.dur);
  env(g, t, o.a || 0.005, o.v || 0.15, o.dur);
  src.connect(fl); fl.connect(g); out(g, o.bus || cur || sfx, o.send);
  src.start(t, Math.random() * 1.5); src.stop(t + o.dur + 0.05);
}
function bell(f, t, v, dur, bus) {
  dur = dur || 0.5;
  tone({ t: t, f: f, dur: dur, v: v, send: 0.25, bus: bus });
  tone({ t: t, f: f * 2, dur: dur * 0.5, v: v * 0.3, bus: bus });
  tone({ t: t, f: f * 3, dur: dur * 0.25, v: v * 0.12, bus: bus });
}
function coin(t, f, v) {
  tone({ t: t, f: f, dur: 0.26, v: v || 0.11, type: 'triangle', send: 0.15 });
  tone({ t: t, f: f * 1.5, dur: 0.18, v: (v || 0.11) * 0.5 });
}
function rasp(t, f1, f2, dur) {          // one saw stroke: buzzing filtered noise
  var src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), am = ctx.createGain(), g = ctx.createGain();
  var lfo = ctx.createOscillator(), depth = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  fl.type = 'bandpass'; fl.Q.value = 1.4; fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  am.gain.value = 0.55; lfo.type = 'sawtooth'; lfo.frequency.value = 46; depth.gain.value = 0.45;
  lfo.connect(depth); depth.connect(am.gain);
  env(g, t, 0.03, 0.38, dur);
  src.connect(fl); fl.connect(am); am.connect(g); out(g, cur || sfx);
  src.start(t, Math.random()); src.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
}

// ---------- sound effects ----------
var S = {
  stepGrass: function (t) {
    // v0.1.108 (Mac: "sfx need the shaker sound gone too"): no short bright hiss. A phone speaker turns it into the same
    // dry click as the music's shaker did. A grass step is now a soft low rustle. The rule for every sound here:
    // no noise burst shorter than about 0.1 s with its energy above about 1.5 kHz.
    noise({ t: t, dur: 0.12, a: 0.02, v: 0.16, ft: 'lowpass', f: rnd(800, 1000), fto: 420 });
  },
  stepSand: function (t) {
    noise({ t: t, dur: 0.14, a: 0.02, v: 0.22, ft: 'lowpass', f: rnd(1000, 1400), fto: 500 });
  },
  stepDock: function (t) {
    tone({ t: t, f: rnd(210, 250), to: 130, dur: 0.09, v: 0.22 });
    tone({ t: t, f: rnd(430, 520), dur: 0.05, v: 0.06, type: 'triangle' });
  },
  cast: function (t) {
    noise({ t: t, dur: 0.28, a: 0.1, v: 0.3, f: 500, fto: 2600, q: 1.5 });
    tone({ t: t + 0.05, f: 900, to: 1800, dur: 0.22, v: 0.03, type: 'triangle' });
  },
  // TACKLE (try/fishing): two cast feels. Zip = the sea cast, a quick rising whir; Plop = river and lake, a soft lob and a round plop
  castZip: function (t) {
    noise({ t: t, dur: 0.2, a: 0.03, v: 0.32, f: 900, fto: 4200, q: 2.5 });
    tone({ t: t + 0.02, f: 1300, to: 2900, dur: 0.16, v: 0.045, type: 'sawtooth' });
  },
  castPlop: function (t) {
    noise({ t: t, dur: 0.34, a: 0.14, v: 0.16, ft: 'lowpass', f: 700, fto: 1300 });
    tone({ t: t + 0.06, f: 520, to: 700, dur: 0.24, v: 0.025, type: 'triangle' });
  },
  plop: function (t) {
    tone({ t: t, f: 520, to: 190, dur: 0.13, v: 0.22 });
    tone({ t: t + 0.07, f: 300, to: 640, dur: 0.09, v: 0.1 });
    noise({ t: t, dur: 0.12, a: 0.004, v: 0.07, ft: 'lowpass', f: 1500, fto: 500 });
  },
  puddle: function (t) {           // stepping in a puddle: a small soft plip
    noise({ t: t, dur: 0.16, a: 0.006, v: 0.07, ft: 'lowpass', f: 2400, fto: 600 });
    tone({ t: t + 0.01, f: 420, to: 760, dur: 0.07, v: 0.06 });
  },
  rumble: function (t) {           // heavy rain only: thunder far out at sea, low and soft, never a bang (Mac: kids play too)
    noise({ t: t, dur: 3.4, a: 0.9, v: 0.16, ft: 'lowpass', f: 150, fto: 60, q: 0.5, send: 0.35 });
    noise({ t: t + 0.5, dur: 2.2, a: 0.5, v: 0.07, ft: 'lowpass', f: 260, fto: 90, q: 0.5, send: 0.3 });
  },
  splash: function (t) {
    noise({ t: t, dur: 0.35, a: 0.008, v: 0.2, ft: 'lowpass', f: 3200, fto: 500, send: 0.2 });
    tone({ t: t + 0.02, f: 260, to: 620, dur: 0.11, v: 0.16 });
    tone({ t: t + 0.14, f: 500, to: 900, dur: 0.07, v: 0.07 });
  },
  bite: function (t) {
    tone({ t: t, f: 420, to: 230, dur: 0.1, v: 0.2 });
    tone({ t: t + 0.1, f: 988, dur: 0.12, v: 0.15, type: 'triangle' });
    tone({ t: t + 0.2, f: 1319, dur: 0.2, v: 0.15, type: 'triangle', send: 0.15 });
  },
  reel: function (t) {
    for (var i = 0; i < 12; i++) {
      var tt = t + i * 0.05 * (1 - i * 0.02);
      tone({ t: tt, f: 1400 + i * 45 + rnd(-30, 30), dur: 0.024, a: 0.002, v: 0.11, type: 'triangle' });
    }
  },
  // REEL: the reeling mini-game
  nibble: function (t) { tone({ t: t, f: 520, to: 380, dur: 0.07, v: 0.09 }); },
  // v0.1.112 (Mac): a zip while you reel in (it climbs as the bar fills), the line running out when you let go, a snap when it breaks.
  // All tones, no bright noise bursts (decision 93).
  reelzip: function (t, k) {
    var u = typeof k === 'number' ? k : 0.5;
    tone({ t: t, f: 900 + u * 900 + rnd(-25, 25), to: 1050 + u * 1000, dur: 0.05, a: 0.004, v: 0.07, type: 'triangle' });
  },
  unravel: function (t) {
    tone({ t: t, f: 520 + rnd(-30, 30), to: 330, dur: 0.1, a: 0.006, v: 0.06, type: 'triangle' });
    noise({ t: t, dur: 0.14, a: 0.03, v: 0.03, ft: 'lowpass', f: 700, fto: 400 });
  },
  snap: function (t) {
    tone({ t: t, f: 1300, to: 160, dur: 0.16, a: 0.003, v: 0.22, type: 'triangle' });
    tone({ t: t + 0.02, f: 240, to: 70, dur: 0.3, a: 0.004, v: 0.2 });
    noise({ t: t, dur: 0.2, a: 0.004, v: 0.16, ft: 'lowpass', f: 900, fto: 250 });
    tone({ t: t + 0.3, f: 392, to: 262, dur: 0.24, v: 0.1, type: 'triangle' });
  },
  reeltick: function (t) {
    tone({ t: t, f: 1500 + rnd(-40, 40), dur: 0.022, a: 0.002, v: 0.08, type: 'triangle' });
  },
  thrash: function (t) {
    noise({ t: t, dur: 0.4, a: 0.01, v: 0.2, ft: 'lowpass', f: 2600, fto: 500, send: 0.15 });
    tone({ t: t, f: 330, to: 220, dur: 0.16, v: 0.16, type: 'triangle' });
    tone({ t: t + 0.16, f: 330, to: 220, dur: 0.16, v: 0.13, type: 'triangle' });
  },
  miss: function (t) { tone({ t: t, f: 392, to: 262, dur: 0.22, v: 0.14, type: 'triangle' }); },
  catch: function (t) {
    noise({ t: t, dur: 0.25, a: 0.008, v: 0.12, ft: 'lowpass', f: 2800, fto: 600 });
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { bell(f, t + 0.06 + i * 0.085, 0.13, i === 3 ? 0.7 : 0.35); });
  },
  till: function (t) {
    noise({ t: t, dur: 0.22, a: 0.01, v: 0.18, ft: 'lowpass', f: 1000, fto: 300 });
    tone({ t: t, f: 170, to: 95, dur: 0.14, v: 0.2 });
    noise({ t: t + 0.06, dur: 0.1, v: 0.07, f: 1800, q: 1 });
  },
  plant: function (t) {
    tone({ t: t, f: 420, to: 240, dur: 0.09, v: 0.18 });
    noise({ t: t + 0.05, dur: 0.07, a: 0.01, v: 0.07, ft: 'lowpass', f: 800 });
  },
  harvest: function (t) {
    tone({ t: t, f: 440, to: 980, dur: 0.09, v: 0.18 });
    tone({ t: t + 0.08, f: 1319, dur: 0.16, v: 0.07, type: 'triangle' });
  },
  water: function (t) {
    noise({ t: t, dur: 0.75, a: 0.14, v: 0.14, f: 5200, q: 0.6 });
    noise({ t: t, dur: 0.7, a: 0.2, v: 0.05, ft: 'lowpass', f: 1200 });
    for (var i = 0; i < 8; i++) { var f = rnd(900, 1800); tone({ t: t + rnd(0.05, 0.6), f: f, to: f * 1.5, dur: 0.04, v: 0.045 }); }
  },
  hitShovel: function (t) {
    noise({ t: t, dur: 0.14, a: 0.004, v: 0.2, f: 1500, fto: 450, q: 1.2 });
    tone({ t: t + 0.03, f: 160, to: 90, dur: 0.12, v: 0.2 });
    tone({ t: t, f: 2400, dur: 0.05, v: 0.03, type: 'triangle' });
  },
  hitSaw: function (t) {
    rasp(t, 1500, 2100, 0.17); rasp(t + 0.21, 2100, 1400, 0.19);
  },
  hitPick: function (t) {
    [1900, 2850, 4130].forEach(function (f) { tone({ t: t, f: f * rnd(0.98, 1.02), dur: 0.2, a: 0.002, v: 0.042, send: 0.2 }); });
    tone({ t: t, f: 950, dur: 0.05, v: 0.09, type: 'triangle' });
    noise({ t: t, dur: 0.08, v: 0.14, ft: 'lowpass', f: 800 });
    tone({ t: t, f: 190, to: 100, dur: 0.08, v: 0.11 });
  },
  dig: function (t) {
    noise({ t: t, dur: 0.16, a: 0.01, v: 0.18, f: 1000, fto: 320, q: 1 });
    noise({ t: t + 0.22, dur: 0.16, a: 0.01, v: 0.18, f: 900, fto: 300, q: 1 });
    tone({ t: t + 0.24, f: 170, to: 100, dur: 0.1, v: 0.14 });
    bell(1568, t + 0.44, 0.07, 0.3); bell(2093, t + 0.52, 0.07, 0.4);
  },
  coins: function (t) { coin(t, 1760); coin(t + 0.07, 2093); coin(t + 0.14, 2637); },
  buy: function (t) {
    tone({ t: t, f: 523.25, dur: 0.1, v: 0.13, type: 'triangle' });
    tone({ t: t + 0.08, f: 783.99, dur: 0.16, v: 0.13, type: 'triangle' });
    coin(t + 0.17, 2093, 0.09); coin(t + 0.24, 2637, 0.09);
  },
  levelUp: function (t) {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { bell(f, t + i * 0.1, 0.12, 0.4); });
    [1046.5, 1318.5, 1568].forEach(function (f) { bell(f, t + 0.55, 0.09, 1.3); });
    noise({ t: t + 0.5, dur: 0.7, a: 0.1, v: 0.025, ft: 'highpass', f: 6000, send: 0.3 });
  },
  shipBell: function (t) {         // the cargo ship's bell: two slow, low tolls that ring on (Mac: a fog horn on a wooden ship was odd)
    function toll(t0, v) {
      var f = 330;
      // hum, strike note (two close tones, so it slowly wobbles like a heavy bell), minor third, fifth, octave, upper shimmer
      [[0.5, 0.5, 4.2], [1, 1, 3.6], [1.006, 0.6, 3.6], [1.19, 0.4, 2.6], [1.5, 0.28, 2.0], [2, 0.5, 2.2], [2.51, 0.14, 1.0], [3.01, 0.08, 0.6]].forEach(function (p) {
        tone({ t: t0, f: f * p[0], dur: p[2], a: 0.006, v: v * p[1], send: 0.5 });
      });
      noise({ t: t0, dur: 0.05, a: 0.003, v: v * 0.45, ft: 'lowpass', f: 1500 });
    }
    toll(t, 0.1); toll(t + 1.25, 0.09);
  },
  tap: function (t) { tone({ t: t, f: 660, to: 520, dur: 0.045, a: 0.003, v: 0.12 }); },
  popOpen: function (t) {
    tone({ t: t, f: 380, to: 640, dur: 0.11, v: 0.13, type: 'triangle' });
  },
  popClose: function (t) { tone({ t: t, f: 600, to: 360, dur: 0.1, v: 0.11, type: 'triangle' }); },
  // ANIMALS (try/chickens): made in code until sound packs arrive
  cluck: function (t) {            // two soft "bok bok" notes
    [0, 0.13].forEach(function (d, i) {
      tone({ t: t + d, f: rnd(520, 580) - i * 40, to: 330, dur: 0.075, a: 0.004, v: 0.07, type: 'triangle' });
    });
  },
  quack: function (t) { [0, 0.16].forEach(function (d) { tone({ t: t + d, f: rnd(400, 440), to: 290, dur: 0.11, a: 0.006, v: 0.05, type: 'sawtooth' }); tone({ t: t + d, f: 860, to: 600, dur: 0.09, a: 0.006, v: 0.02, type: 'square' }); }); },
  peep: function (t) { tone({ t: t, f: rnd(2300, 2600), to: 3300, dur: 0.07, a: 0.004, v: 0.045 }); tone({ t: t + 0.11, f: 2500, to: 3400, dur: 0.06, a: 0.004, v: 0.035 }); },
  eggPop: function (t) { tone({ t: t, f: 420, to: 880, dur: 0.12, a: 0.004, v: 0.11, type: 'triangle' }); tone({ t: t + 0.1, f: 1320, dur: 0.16, a: 0.003, v: 0.05, send: 0.2 }); }
};

var lastPlayed = {};
function play(name, level) {                       // level (0..1) is optional: quieter when far away
  if (!ctx || ctx.state !== 'running' || !S[name]) return;
  var now = ctx.currentTime;
  if (now - (lastPlayed[name] || -1) < 0.07) return;   // dragging a tool across ten plots is not ten sounds at once
  lastPlayed[name] = now;
  var k = null; if (name === 'reelzip') { k = level; level = null; }   // for the reel zip the number is how full the bar is (its pitch), not a loudness
  if (level != null && level < 1) {
    var b = { in: mkGain(level, sfx.in), wet: mkGain(level, sfx.wet) }; cur = b;
    setTimeout(function () { b.in.disconnect(); b.wet.disconnect(); }, 7000);
  }
  S[name](now + 0.02, k); cur = null;
}

// ---------- instruments (music) ----------
var sess = null;                                   // the bus the current song plays into
function kal(m, t, v) {                            // music-box / kalimba: soft FM pluck
  var f = mf(m), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = f; mod.frequency.value = f * 3;
  // Note starts are a little softer than at first (Mac, Nov 19: the halfway setting, "Good, use it"): less of the bright
  // 'ting' here, and less of the knock on the piano, bass and marimba below.
  mg.gain.setValueAtTime(f * 0.8, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.09);
  mod.connect(mg); mg.connect(car.frequency);
  env(g, t, 0.007, v, 1.1); car.connect(g); out(g, sess, 0.3);
  car.start(t); mod.start(t); car.stop(t + 1.2); mod.stop(t + 1.2);
}
function ep(m, t, v, dur) {                        // soft electric piano
  var f = mf(m); dur = dur || 1.8;
  tone({ t: t, f: f, dur: dur, a: 0.017, v: v, bus: sess, send: 0.35 });
  tone({ t: t, f: f * 2, dur: dur * 0.5, a: 0.017, v: v * 0.22, bus: sess });
  tone({ t: t, f: f * 4, dur: 0.12, v: v * 0.04, bus: sess });
}
function flute(m, t, dur, v) {                     // whistle-like lead
  var f = mf(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = mkGain(0.12, g);
  var vib = ctx.createOscillator(), vd = ctx.createGain();
  o.frequency.value = f; o2.frequency.value = f * 2; vib.frequency.value = 5;
  vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(f * 0.006, t + 0.25);
  vib.connect(vd); vd.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.05);
  g.gain.setValueAtTime(v, t + Math.max(0.06, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
  o.connect(g); o2.connect(g2); out(g, sess, 0.3);
  [o, o2, vib].forEach(function (x) { x.start(t); x.stop(t + dur + 0.1); });
}
function pad(notes, t, dur, v, cutoff) {           // warm held chord
  var fl = ctx.createBiquadFilter(), g = ctx.createGain();
  fl.type = 'lowpass'; fl.frequency.value = cutoff || 1400;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.9);
  g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.0);
  notes.forEach(function (m) {
    [-6, 6].forEach(function (c) {
      var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mf(m); o.detune.value = c;
      o.connect(fl); o.start(t); o.stop(t + dur + 1.1);
    });
  });
  fl.connect(g); out(g, sess, 0.4);
}
function bass(m, t, dur, v) {
  tone({ t: t, f: mf(m), dur: dur, a: 0.028, v: v, bus: sess });
  tone({ t: t, f: mf(m), dur: dur * 0.6, a: 0.028, v: v * 0.45, type: 'triangle', bus: sess });
}
function mar(m, t, v) {                            // soft marimba: round, no buzz
  var f = mf(m);
  tone({ t: t, f: f, dur: 0.38, a: 0.007, v: v, bus: sess, send: 0.25 });
  tone({ t: t, f: f * 4, dur: 0.06, a: 0.005, v: v * 0.14, bus: sess });   // the mallet knock
}
// No shaker in the music (Mac, Nov 19: "It's 10000% the shaker. Take it out."). On a phone speaker its short hiss
// came out as a dry click that sounded like clipping.

// ---------- the songs (original; 8 bars each, 8 steps to a bar) ----------
var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function N(s) { var a = s.length === 3 ? (s[1] === '#' ? 1 : -1) : 0; return 12 * (+s[s.length - 1] + 1) + PC[s[0]] + a; }
var CH = { C: [0, [0, 4, 7]], D: [2, [0, 4, 7]], Em: [4, [0, 3, 7]], F: [5, [0, 4, 7]], G: [7, [0, 4, 7]], Am: [9, [0, 3, 7]],
  Fmaj7: [5, [0, 4, 7, 11]], Dm7: [2, [0, 3, 7, 10]], Bbmaj7: [10, [0, 4, 7, 11]], Am7: [9, [0, 3, 7, 10]],
  A: [9, [0, 4, 7]], Bm: [11, [0, 3, 7]], Dm: [2, [0, 3, 7]], Bb: [10, [0, 4, 7]], E: [4, [0, 4, 7]], Gm: [7, [0, 3, 7]],
  Cmaj7: [0, [0, 4, 7, 11]], Em7: [4, [0, 3, 7, 10]] };
function chord(name) { var c = CH[name], r = 48 + c[0]; if (r > 55) r -= 12; return c[1].map(function (i) { return r + i; }); }

var MOODS = {
  box: { name: 'Music Box Harbor', bpm: 76, nightBpm: 60, sparse: true, bars: [
    ['C', 'E5 - G5 - C6 - G5 -'], ['Am', 'A5 - E5 - C5 - E5 -'], ['F', 'F5 - A5 - C6 - A5 G5'], ['G', 'G5 - D5 - B4 - D5 -'],
    ['C', 'E5 G5 C6 - B5 - G5 -'], ['Em', 'G5 - E5 - B4 - E5 -'], ['F', 'A5 - F5 - A5 C6 A5 -'], ['G', 'G5 - F5 - D5 - B4 -']] },
  uke: { name: 'Sunny Dock', bpm: 100, nightBpm: 76, sparse: true, swing: 0.14, bars: [
    ['G', 'B4 - D5 - G5 - D5 -'], ['Em', 'E5 - G5 - B4 - - -'], ['C', 'C5 - E5 - G5 - E5 -'], ['D', 'F#5 - A5 - D5 - - -'],
    ['G', 'B4 D5 G5 - B5 - G5 -'], ['Em', 'G5 - E5 - G5 - B4 -'], ['C', 'C5 - E5 - D5 - F#5 -'], ['G', 'G5 - - - - - - -']] },
  drift: { name: 'Drifting Tide', bpm: 63, nightBpm: 52, sparse: false, bars: [
    ['Fmaj7', 'A4 - - C5 - - F5 -'], ['Dm7', 'F5 - - D5 - - A4 -'], ['Bbmaj7', 'D5 - - F5 - - A5 -'], ['C', 'G5 - - E5 - - C5 -'],
    ['Fmaj7', 'A4 - C5 - F5 - - -'], ['Am7', 'E5 - - C5 - - A4 -'], ['Bbmaj7', 'D5 - F5 - Bb5 - A5 -'], ['C', 'G5 - - - C5 - - -']] },
  // ---- Added Nov 19. Mac: "The day time music could use another track." All original, written for Tidewell.
  //      Each is two 8-bar parts played main, main, middle, main (32 bars), so it runs about a minute before repeating.
  //      Mac's rules for these: the game's own soft instruments (no square waves), no shaker, no swelling pad,
  //      nothing jumping up an octave, and each part ends on a held note.
  home: { name: 'Home Harbor', feel: 'home', aaba: true, bpm: 104, bars: [          // the smooth version: "better for night time" -> evening
    ['D', 'F#5 - A5 - D6 - - A5'], ['A', 'C#6 - - B5 A5 - E5 -'], ['Bm', 'D5 - F#5 - B5 - - A5'], ['G', 'G5 - - F#5 D5 - - -'],
    ['D', 'F#5 - A5 - D6 - B5 -'], ['G', 'D6 - B5 - G5 - B5 -'], ['Em', 'E5 - G5 - B5 - A5 G5'], ['A', 'A5 - - - - - - -'],
    ['G', 'B5 - - D6 B5 - G5 -'], ['D', 'A5 - - F#5 D5 - - -'], ['Em', 'G5 - - B5 G5 - E5 -'], ['A', 'E5 - A5 - C#6 - - -'],
    ['G', 'B5 - D6 - B5 - - G5'], ['D', 'A5 - - F#5 A5 - - -'], ['E', 'B5 - G#5 - E5 - G#5 B5'], ['A', 'C#6 - - - A5 - - -']] },
  homeday: { name: 'Home Harbor, busy', feel: 'homebusy', aaba: true, bpm: 104, bars: null },   // same tune, lively, for the day
  bustle: { name: 'Dockside Bustle', feel: 'bustle', aaba: true, bpm: 132, bars: [
    ['C', 'E5 G5 C6 G5 E5 G5 C6 -'], ['C', 'D6 - C6 - G5 - - -'], ['F', 'F5 A5 C6 A5 F5 A5 C6 -'], ['G', 'D6 - B5 - G5 - - -'],
    ['C', 'E6 - D6 C6 - G5 E5 -'], ['Am', 'C6 - B5 A5 - E5 C5 -'], ['Dm', 'D5 F5 A5 - D6 - C6 -'], ['G', 'B5 - G5 - D5 - G5 -'],
    ['Am', 'A5 - C6 - E6 - - C6'], ['Em', 'B5 - - G5 E5 - - -'], ['F', 'A5 - C6 - F6 - - C6'], ['C', 'E6 - - C6 G5 - - -'],
    ['Am', 'A5 C6 E6 - C6 - A5 -'], ['Em', 'G5 B5 E6 - B5 - G5 -'], ['F', 'F5 A5 C6 - A5 - F5 -'], ['G', 'G5 - B5 - D6 - - -']] },
  hop: { name: 'Tide Pool Hop', feel: 'hop', aaba: true, bpm: 112, swing: 0.12, bars: [
    ['F', 'C5 - F5 A5 - C6 - A5'], ['Dm', 'F5 - - D5 F5 - A5 -'], ['Bb', 'D5 - F5 Bb5 - D6 - Bb5'], ['C', 'G5 - - E5 G5 - - -'],
    ['F', 'C5 - F5 A5 - C6 - A5'], ['Am', 'C6 - A5 - E5 - A5 -'], ['Gm', 'Bb5 - G5 - D5 - G5 Bb5'], ['C', 'C6 - - - - - - -'],
    ['Bb', 'D6 - Bb5 - F5 - Bb5 -'], ['F', 'C6 - A5 - F5 - - -'], ['Gm', 'Bb5 - G5 - D5 - G5 -'], ['C', 'E5 - G5 - C6 - - -'],
    ['Bb', 'D6 - - Bb5 D6 - F5 -'], ['F', 'C6 - - A5 C6 - F5 -'], ['Dm', 'A5 - F5 - D5 - F5 A5'], ['C', 'G5 - - - - - - -']] },
  lazy: { name: 'Lazy Morning', feel: 'lazy', aaba: true, bpm: 84, swing: 0.16, bars: [   // first called Lazy Afternoon; Mac: "sounds like a good song for the morning actually", then "rename song to lazy morning"
    ['Cmaj7', 'E5 - G5 - - B5 - G5'], ['Am7', 'A5 - - G5 E5 - - -'], ['Dm7', 'F5 - A5 - - C6 - A5'], ['G', 'B5 - - G5 D5 - - -'],
    ['Cmaj7', 'E5 - G5 - - B5 - D6'], ['Em7', 'B5 - - G5 E5 - G5 -'], ['Fmaj7', 'A5 - C6 - - A5 - F5'], ['G', 'G5 - - - - - - -'],
    ['Fmaj7', 'A5 - - C6 A5 - F5 -'], ['Em7', 'G5 - - B5 G5 - E5 -'], ['Dm7', 'F5 - - A5 F5 - D5 -'], ['Cmaj7', 'E5 - - G5 - - - -'],
    ['Fmaj7', 'A5 - C6 - - A5 - F5'], ['Em7', 'G5 - B5 - - G5 - E5'], ['Dm7', 'F5 - A5 - D6 - - A5'], ['G', 'B5 - - - - - - -']] }
};
MOODS.homeday.bars = MOODS.home.bars;

var song = null;
function scheduleBar() {
  var M = MOODS[song.id], night = song.night, k32 = song.bar % 32;
  var bi = M.aaba ? (k32 < 16 ? k32 % 8 : k32 < 24 ? k32 - 8 : k32 - 24) : song.bar % M.bars.length, bar = M.bars[bi];   // main, main, middle, main
  var sd = 60 / (night ? M.nightBpm : M.bpm) / 2, t0 = song.next, barDur = sd * 8;
  var ch = chord(bar[0]), toks = bar[1].split(' ');
  function at(i) { return t0 + i * sd + (M.swing && !night && i % 2 ? M.swing * sd : 0); }
  // lead
  toks.forEach(function (tok, i) {
    if (tok === '-') return;
    if (night && M.sparse && !(i === 0 || i === 4 || (i === 6 && bi % 2))) return;
    var m = N(tok) - (night ? 12 : 0), acc = i === 0 ? 1.15 : 1;
    if (M.feel === 'home') ep(m, at(i), 0.14 * acc, 2.4);                                               // soft piano
    else if (M.feel === 'homebusy') { kal(m, at(i), 0.15 * acc); ep(m, at(i), 0.06 * acc, 1.2); }       // music box with a little piano under it
    else if (M.feel === 'bustle') kal(m, at(i), 0.19 * acc);                                            // music box
    else if (M.feel === 'hop') { mar(m, at(i), 0.3 * acc); kal(m + 12, at(i), 0.07 * acc); }            // marimba with a bell on top
    else if (M.feel === 'lazy') ep(m, at(i), 0.17 * acc, 1.8);                                          // soft piano
    else if (song.id === 'box') { if (night) ep(m, at(i), 0.11 * acc, 2.2); else kal(m, at(i), 0.2 * acc); }
    else if (song.id === 'uke') { if (night) ep(m, at(i), 0.11 * acc, 2.2); else flute(m, at(i), sd * 1.6, 0.1 * acc); }
    else ep(m, at(i), (night ? 0.1 : 0.13) * acc, night ? 2.6 : 2);
  });
  // backing
  var r = ch[0], fifth = r + 7 > 57 ? r - 5 : r + 7, q;
  if (M.feel === 'home') {                           // calm: a low piano chord, two bass notes, three soft marimba notes
    ch.forEach(function (m) { ep(m, at(0), 0.026, 2.8); });
    bass(r, at(0), sd * 4, 0.12); bass(fifth, at(4), sd * 3.5, 0.08);
    [2, 4, 6].forEach(function (i, k) { mar(ch[[1, 2, 1][k]] + 12, at(i), 0.045); });
  } else if (M.feel === 'homebusy') {                // lively: rolling marimba and a moving bass
    bass(r, at(0), sd * 3.5, 0.12); bass(fifth, at(4), sd * 1.8, 0.09); bass(r, at(6), sd * 1.6, 0.07);
    for (q = 0; q < 8; q++) mar(ch[[0, 1, 2, 1][q % 4]] + 12, at(q), q % 2 ? 0.035 : 0.045);
  } else if (M.feel === 'bustle') {                  // walking bass and marimba broken chords
    [r, r + 7, r + 12, r + 7].forEach(function (m, k) { bass(m, at(k * 2), sd * 1.6, k ? 0.085 : 0.11); });
    for (q = 0; q < 8; q++) mar(ch[[0, 1, 2, 1][q % 4]] + 12, at(q), 0.04);
  } else if (M.feel === 'hop') {                     // skipping bass, marimba chords off the beat
    bass(r, at(0), sd * 2.6, 0.15); bass(fifth, at(3), sd * 1.5, 0.12); bass(r, at(6), sd * 1.6, 0.1);
    [2, 5, 7].forEach(function (i) { [ch[1] + 12, ch[2] + 12].forEach(function (m) { mar(m, at(i), 0.06); }); });
  } else if (M.feel === 'lazy') {                    // laid-back: soft key chords, a mellow bass, and the game's only drum beat (a quiet kick and rim)
    [0, 3].forEach(function (i) { ch.forEach(function (m) { ep(m + 12, at(i), 0.042, 0.9); }); });
    bass(r, at(0), sd * 2.6, 0.12); bass(r, at(3), sd * 2.4, 0.08); bass(fifth, at(6), sd * 1.6, 0.08);
    tone({ t: at(0), f: 210, to: 95, dur: 0.09, a: 0.004, v: 0.09, type: 'triangle', bus: sess });
    tone({ t: at(5), f: 210, to: 95, dur: 0.09, a: 0.004, v: 0.07, type: 'triangle', bus: sess });
    // (the rim on beats 2 and 6 was a 45 ms noise burst, the same thing as the shaker: out, decision 93)
  } else if (song.id === 'box') {
    bass(ch[0], at(0), sd * 4, 0.13); if (!night) bass(ch[0], at(4), sd * 3, 0.08);
    pad(ch, t0, barDur, night ? 0.05 : 0.03, night ? 900 : 1400);
    if (!night) { kal(ch[1] + 12, at(2), 0.06); kal(ch[2] + 12, at(6), 0.06); }
  } else if (song.id === 'uke') {                  // marimba backing (the plucked-string strum was removed: it sounded bad)
    bass(ch[0], at(0), sd * 2.5, 0.12); bass(ch[0] + (ch[0] >= 50 ? -5 : 7), at(4), sd * 2.5, night ? 0.07 : 0.09);
    (night ? [2] : [2, 5, 6]).forEach(function (i) {
      ch.forEach(function (m) { mar(m + 12, at(i), i === 5 ? 0.055 : 0.08); });
    });
    if (night) pad(ch, t0, barDur, 0.045, 800);
  } else {
    pad(ch, t0, barDur, night ? 0.05 : 0.042, night ? 800 : 1500);
    bass(ch[0], at(0), sd * 6, 0.12);
    if (!night && bi % 2) ep(ch[2] + 24, at(5), 0.035, 1.5);
  }
  song.bar++; song.next = t0 + barDur;
}
// The music takes turns (Mac: "so players don't get bored, like Animal Crossing").
//   morning: Music Box Harbor and Lazy Morning take turns   (Mac, Nov 19: it "sounds like a good song for the morning")
//   day:     four tunes take turns: Sunny Dock, Home Harbor (busy), Dockside Bustle, Tide Pool Hop   (Mac's picks, Nov 19)
//   evening: Home Harbor (smooth)   (Mac: "better for night time"; it replaces the slow Sunny Dock)
//   night:   Music Box Harbor, slow
//   rain:    Drifting Tide (only while it rains; weather.js calls setWeather)
// A turn lasts about 100 seconds, then the music rests and only the shore sounds play.
var SET_SECONDS = 100, REST_SECONDS = 30;
var DAY_TUNES = ['uke', 'homeday', 'bustle', 'hop'], MORNING_TUNES = ['box', 'lazy'];
var G = { dayTurn: Math.floor(Math.random() * DAY_TUNES.length), mornTurn: Math.floor(Math.random() * MORNING_TUNES.length), tod: 'day', weather: null, sets: 0, restUntil: 0, started: false, px: 0, pz: 0, walked: 0.6, lastStep: 0, zoneAt: 0, dockD: 0 };
function pickTune() {
  var slow = G.tod === 'night' || G.tod === 'evening';
  if (G.weather === 'rain') return ['drift', slow];
  if (G.tod === 'morning') return [MORNING_TUNES[G.mornTurn++ % MORNING_TUNES.length], false];
  if (G.tod === 'day') return [DAY_TUNES[G.dayTurn++ % DAY_TUNES.length], false];   // a different day tune each turn
  return G.tod === 'evening' ? ['home', false] : ['box', true];
}
function retire(old, fade) {
  if (!old) return;
  if (fade) [old.in, old.wet].forEach(function (g) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, 0.25); });
  setTimeout(function () { old.in.disconnect(); old.wet.disconnect(); }, fade ? 1500 : 6000);
}
function beginSet() {
  var p = pickTune(), M = MOODS[p[0]], bpm = p[1] ? M.nightBpm : M.bpm;
  var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = p[1] ? 2600 : 9000; fl.connect(mus.in);
  retire(sess, false);
  sess = { in: mkGain(1, fl), wet: mkGain(p[1] ? 1.3 : 1, mus.wet) };
  song = { id: p[0], night: p[1], bar: 0, next: ctx.currentTime + 0.15, left: M.aaba ? 32 * Math.max(1, Math.round(SET_SECONDS / (128 * 60 / bpm))) : 8 * Math.max(2, Math.round(SET_SECONDS / (32 * 60 / bpm))) };   // whole passes of the tune
  G.sets++;
}
function tick() {
  if (!ctx || ctx.state !== 'running') return;
  if (song && song.next < ctx.currentTime - 1) song.next = ctx.currentTime + 0.15;   // back after a pause: carry on from now, don't replay what was missed
  if (!song) { if (ctx.currentTime >= G.restUntil) beginSet(); return; }
  while (song && song.next < ctx.currentTime + 0.6) {
    if (song.left <= 0) { G.restUntil = song.next + REST_SECONDS; song = null; break; }
    scheduleBar(); song.left--;
  }
}
function cutMusic() { if (!ctx) return; retire(sess, true); sess = null; song = null; G.restUntil = ctx.currentTime + 2; }

// ---------- ambience, split into zones (follows the Sounds slider) ----------
// Each voice has its own volume, so it can fade as the player walks away from where it lives.
var amb = {};
function wavesOn(b) {
  var src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = mkGain(0.02);
  src.buffer = noiseBuf; src.loop = true; fl.type = 'lowpass'; fl.frequency.value = 500;
  src.connect(fl); fl.connect(g); out(g, b, 0.15); src.start();
  var next = ctx.currentTime + 0.1;
  return function () {
    while (next < ctx.currentTime + 1) {
      var up = rnd(2, 2.8), down = rnd(3.2, 4.4), pk = rnd(0.1, 0.15);
      g.gain.setValueAtTime(0.02, next); g.gain.linearRampToValueAtTime(pk, next + up); g.gain.linearRampToValueAtTime(0.02, next + up + down);
      fl.frequency.setValueAtTime(450, next); fl.frequency.linearRampToValueAtTime(rnd(1300, 1700), next + up); fl.frequency.linearRampToValueAtTime(450, next + up + down);
      next += up + down + rnd(0.3, 1.2);
    }
  };
}
function gullsOn(b) {
  var next = ctx.currentTime + 1.2;
  function cry(t, f, dur, v) {
    var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.8, t);
    o.frequency.linearRampToValueAtTime(f * 1.25, t + dur * 0.25); o.frequency.linearRampToValueAtTime(f * 0.72, t + dur);
    fl.type = 'bandpass'; fl.frequency.value = f * 1.9; fl.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.04);
    g.gain.setValueAtTime(v, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); out(g, b, 0.45); o.start(t); o.stop(t + dur + 0.05);
  }
  return function () {
    while (next < ctx.currentTime + 1) {
      var f = rnd(950, 1250), n = 2 + Math.floor(Math.random() * 3), t = next;
      cry(t, f, 0.48, 0.1); t += 0.56;
      for (var i = 0; i < n; i++) { cry(t, f * rnd(0.97, 1.05), 0.2, 0.08); t += 0.27; }
      next = t + rnd(14, 28);   // Mac: rarer and quieter until a recording replaces them
    }
  };
}
function harborOn(b) {                             // boats at the dock: water lapping, a hull creak, a far buoy bell
  var next = ctx.currentTime + 0.3, k = 0;
  return function () {
    while (next < ctx.currentTime + 1) {
      var t = next;
      noise({ t: t, dur: 0.38, a: 0.06, v: 0.17, ft: 'lowpass', f: 1000, fto: 320, bus: b });
      tone({ t: t + 0.08, f: rnd(280, 340), to: 460, dur: 0.06, v: 0.06, bus: b });
      if (k % 4 === 2) {
        var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), f = rnd(220, 270);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t + 0.5); o.frequency.linearRampToValueAtTime(f * 1.12, t + 0.75); o.frequency.linearRampToValueAtTime(f * 0.94, t + 1.1);
        fl.type = 'bandpass'; fl.frequency.value = 950; fl.Q.value = 6;
        env(g, t + 0.5, 0.15, 0.09, 0.65); o.connect(fl); fl.connect(g); out(g, b, 0.2); o.start(t + 0.5); o.stop(t + 1.2);
      }
      if (k % 6 === 4) { bell(830, t + 0.3, 0.035, 1.6, b); tone({ t: t + 0.3, f: 830 * 2.4, dur: 0.6, v: 0.012, bus: b, send: 0.3 }); }
      k++; next += rnd(1.3, 2.6);
    }
  };
}
function rainOn(b) {                               // soft, steady rain: a high hiss plus a lower patter. weather.js sets how loud.
  var src = ctx.createBufferSource(), hi = ctx.createBiquadFilter(), g1 = mkGain(0.05);
  src.buffer = noiseBuf; src.loop = true; hi.type = 'bandpass'; hi.frequency.value = 5200; hi.Q.value = 0.5;
  src.connect(hi); hi.connect(g1); out(g1, b, 0.1); src.start(0, 0.3);
  var src2 = ctx.createBufferSource(), lo = ctx.createBiquadFilter(), g2 = mkGain(0.035);
  src2.buffer = noiseBuf; src2.loop = true; lo.type = 'bandpass'; lo.frequency.value = 1300; lo.Q.value = 0.6;
  src2.connect(lo); lo.connect(g2); out(g2, b); src2.start(0, 1.1);
  return function () {};
}
function windOn(b) {                               // a soft, breathing wind for windy spells. weather.js sets how loud.
  var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = mkGain(0.06);
  src.buffer = noiseBuf; src.loop = true; f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.7;
  src.connect(f); f.connect(g); out(g, b, 0.15); src.start(0, 0.7);
  var lfo = ctx.createOscillator(), depth = mkGain(170); lfo.frequency.value = 0.11; lfo.connect(depth); depth.connect(f.frequency); lfo.start();
  var lfo2 = ctx.createOscillator(), d2 = mkGain(0.025); lfo2.frequency.value = 0.07; lfo2.connect(d2); d2.connect(g.gain); lfo2.start();
  return function () {};
}
function birdsOn(b) {
  var next = ctx.currentTime + 0.4;
  return function () {
    while (next < ctx.currentTime + 1) {
      var n = 2 + Math.floor(Math.random() * 4), f0 = rnd(2600, 4000), t = next;
      for (var i = 0; i < n; i++) { tone({ t: t, f: f0 * rnd(0.92, 1.08), to: f0 * rnd(0.8, 1.3), dur: rnd(0.06, 0.1), a: 0.012, v: 0.035, send: 0.3, bus: b }); t += rnd(0.09, 0.15); }
      next = t + rnd(1.8, 5.5);
    }
  };
}
function cricketsOn(b) {
  var next = ctx.currentTime + 0.2;
  return function () {
    while (next < ctx.currentTime + 1) {
      var f = Math.random() < 0.5 ? 4300 : 4750;
      for (var i = 0; i < 3; i++) tone({ t: next + i * 0.045, f: f, dur: 0.035, a: 0.008, v: 0.02, bus: b });
      next += rnd(0.7, 1.3);
    }
  };
}
var AMB_ON = { waves: wavesOn, gulls: gullsOn, harbor: harborOn, birds: birdsOn, crickets: cricketsOn, rain: rainOn, wind: windOn };
function setAmb(name, on, level) {
  if (!AMB_ON[name]) return;
  if (amb[name]) {
    var old = amb[name]; clearInterval(old.id); amb[name] = null;
    [old.bus.in, old.bus.wet].forEach(function (g) { g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); });
    setTimeout(function () { old.bus.in.disconnect(); old.bus.wet.disconnect(); }, 1500);
  }
  if (on && init()) {
    var lv = level == null ? 1 : level, bus = { in: mkGain(lv, sfx.in), wet: mkGain(lv, sfx.wet) };
    var run = AMB_ON[name](bus); run();
    amb[name] = { bus: bus, id: setInterval(run, 500) };
  }
}
function ambLevel(name, v) {                       // slow fade, like walking away
  var a = amb[name]; if (!a) return;
  [a.bus.in, a.bus.wet].forEach(function (g) { g.gain.setTargetAtTime(v, ctx.currentTime, 0.35); });
}
// How loud each voice is where the player stands (Mac: split into zones, fade slowly when you walk away).
// shoreD = metres inland from the waterline, dockD = metres from the dock.
function zoneLevels(shoreD, dockD, tod) {
  function fadeOut(d, end, curve) { return Math.pow(Math.max(0, 1 - d / end), curve); }
  var night = tod === 'night', land = Math.max(0, Math.min(1, (shoreD - 3) / 6));
  return { waves: fadeOut(shoreD, 10, 1.4), gulls: night ? 0 : fadeOut(shoreD, 12, 1.2), harbor: fadeOut(dockD, 7, 1.6),
    birds: night ? 0 : land, crickets: night ? land : 0 };
}
function shipLevel() { return 0.15 + 0.85 * Math.pow(Math.max(0, 1 - G.dockD / 25), 1.3); }   // never silent: the ship is always noticed

// ---------- volume ----------
function setVol(kind, v) {
  vol[kind] = Math.max(0, Math.min(1, v));
  if (!ctx) return;
  var bus = kind === 'music' ? mus : sfx, k = kind === 'music' ? MUSIC_GAIN : SFX_GAIN;
  bus.in.gain.setTargetAtTime(vol[kind] * k, ctx.currentTime, 0.03);
}
function mute(b) { vol.muted = !!b; if (ctx) master.gain.setTargetAtTime(b ? 0 : 1, ctx.currentTime, 0.03); }


// ---------- the game's hooks ----------
function startAmbience() { Object.keys(AMB_ON).forEach(function (n) { setAmb(n, true, 0); }); G.zoneAt = 0; }
// Coming back to the game. Mac, Nov 14: "When I closed out the game in debug mode and came back to it later, the
// music wasn't working at all." A phone can leave the audio paused, "interrupted", or running but silent after the
// page has been in the background. So: any tap resumes it whatever state it is in; after more than 30 seconds
// away, or if it will not resume, all of the audio is rebuilt from scratch on the next tap.
var tickId = 0, hiddenAt = 0, stale = false, stuckSince = 0;
function rebuild() {
  Object.keys(amb).forEach(function (n) { if (amb[n]) { clearInterval(amb[n].id); amb[n] = null; } });
  if (tickId) { clearInterval(tickId); tickId = 0; }
  try { ctx.close().catch(function () {}); } catch (e) { /* already closed */ }
  ctx = null; sess = null; song = null; cur = null; lastPlayed = {};
  G.started = false; G.restUntil = 0; G.zoneAt = 0; G.lastStep = 0; stale = false; stuckSince = 0;
}
function unlock() {                                  // runs on every tap; cheap after the first
  if (ctx && !document.hidden && (stale || (stuckSince && Date.now() - stuckSince > 1500))) rebuild();
  if (!init()) return;
  if (hushed && !document.hidden) unhush();   // a tap after coming back: make sure the fade-out from leaving is undone
  if (ctx.state !== 'running' && !document.hidden) { if (!stuckSince) stuckSince = Date.now(); ctx.resume().catch(function () {}); }
  else if (ctx.state === 'running') stuckSince = 0;
  if (!G.started) { G.started = true; startAmbience(); tickId = setInterval(tick, 120); }
}
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });
document.addEventListener('visibilitychange', function () {
  if (!ctx) return;
  if (document.hidden) { hiddenAt = Date.now(); hush(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 30000) stale = true;
  clearTimeout(hushT);
  if (G.started && !stale) { ctx.resume().catch(function () {}); unhush(); }
});
// v0.1.137 (Mac: "when I close the game it makes a beep sound"): pausing the sound in the middle of a note cut it off with a
// blip. Leaving the game now fades everything out over a few hundredths of a second first, then pauses; coming back fades it in.
var hushT = 0, hushed = false;
function hush() {
  if (!ctx || !master) return;
  hushed = true;
  try { var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0, t, 0.012); } catch (e) { /* closed */ }
  clearTimeout(hushT); hushT = setTimeout(function () { if (ctx && document.hidden) ctx.suspend().catch(function () {}); }, 90);
}
function unhush() {
  if (!ctx || !master) return;
  hushed = false;
  try { var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(vol.muted ? 0 : 1, t, 0.05); } catch (e) { /* closed */ }
}
window.addEventListener('pagehide', hush);
window.addEventListener('pageshow', function (e) { if (ctx && e.persisted) stale = true; });

// buttons tick, pop-ups blip: wired here so main.js needs no hook for them
document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('button')) play('tap'); }, true);
var sheetWatch = new MutationObserver(function (list) {
  list.forEach(function (m) { play(m.target.hidden ? 'popClose' : 'popOpen'); });
});
document.querySelectorAll('.sheet').forEach(function (el) { sheetWatch.observe(el, { attributes: true, attributeFilter: ['hidden'] }); });

// once a frame from main.js: footsteps, and how loud each zone is from here
function frame(x, z, moving, onDock, tod, stepPhase) {
  G.tod = tod;
  var d = Math.hypot(x - G.px, z - G.pz); G.px = x; G.pz = z;
  var dx = Math.max(0, Math.abs(x - 0) - 0.97), dz = Math.max(0, z + 3.2);   // the dock is in the middle since v0.1.133
  G.dockD = onDock ? 0 : Math.hypot(dx, dz);
  if (!ctx || ctx.state !== 'running') return;
  var now = ctx.currentTime;
  var surface = onDock ? 'stepDock' : z < -2.5 ? 'stepSand' : 'stepGrass';
  if (stepPhase != null) {
    // Footsteps follow the legs, not the distance (Mac: after the new run animation "the sounds don't line up when running").
    // stepPhase is the animation's own cycle, 0..1, where 0 = the left foot reaches the ground and 0.5 = the right foot.
    // A step sounds each time the cycle crosses one of those two points, at any speed, including the last step when stopping.
    var half = Math.floor((((stepPhase % 1) + 1) % 1) * 2);
    if (G.half != null && half !== G.half && now - G.lastStep > 0.1) { G.lastStep = now; play(surface); }
    G.half = half;
  } else if (!moving) G.walked = 0.6;                // no animation cycle to follow: fall back to one step per 1.1 m
  else if (d < 1) {
    G.walked += d;
    if (G.walked > 1.1 && now - G.lastStep > 0.26) { G.walked = 0; G.lastStep = now; play(surface); }
  }
  if (now - G.zoneAt > 0.2) {
    G.zoneAt = now;
    var lv = zoneLevels(onDock ? 0 : Math.max(0, z + 3.4), G.dockD, tod);
    var dry = 1 - Math.min(1, (G.rain || 0) * 1.6);   // gulls, songbirds and crickets go quiet in the rain
    lv.gulls *= dry; lv.birds *= dry; lv.crickets *= dry;
    lv.rain = Math.min(1, (G.rain || 0) * 1.1);
    lv.wind = G.wind || 0;
    Object.keys(lv).forEach(function (n) { ambLevel(n, lv[n]); });
  }
}
var HIT = { shovel: 'hitShovel', saw: 'hitSaw', pick: 'hitPick' };

// Settings: two sliders and a mute button (Mac picked mockup 3A). Saved with the game's other settings.
function bindSettings(settings, store) {
  if (typeof settings.music === 'number') vol.music = settings.music;
  if (typeof settings.sfx === 'number') vol.sfx = settings.sfx;
  vol.muted = !!settings.mute;
  var m = document.getElementById('volMusic'), s = document.getElementById('volSfx'), b = document.getElementById('muteBtn');
  if (!m || !s || !b) return;
  function show() { b.setAttribute('aria-pressed', vol.muted ? 'true' : 'false'); b.classList.toggle('on', vol.muted); }
  m.value = Math.round(vol.music * 100); s.value = Math.round(vol.sfx * 100); show();
  m.addEventListener('input', function () { setVol('music', m.value / 100); settings.music = vol.music; store(settings); });
  s.addEventListener('input', function () { setVol('sfx', s.value / 100); settings.sfx = vol.sfx; store(settings); play('coins'); });
  b.addEventListener('click', function () { mute(!vol.muted); settings.mute = vol.muted; store(settings); show(); });
}

export const audio = {
  play: play,
  _state: function () { return { gain: master ? +master.gain.value.toFixed(3) : null, ctx: ctx ? ctx.state : null, hushed: hushed }; },   // for tests
  hit: function (tool) { play(HIT[tool] || 'plant'); },            // one hit while clearing; bare hands get a soft pat
  shipBell: function () { play('shipBell', shipLevel()); },        // quieter the farther you are from the dock
  frame: frame,
  bindSettings: bindSettings,
  setWeather: function (w) { if (w !== G.weather) { G.weather = w || null; if (song && (song.id === 'drift') !== (w === 'rain')) cutMusic(); } },
  setWind: function (level) { G.wind = Math.max(0, Math.min(1, level || 0)); },   // 0 calm .. 1 a windy spell
  setRain: function (level) { G.rain = Math.max(0, Math.min(1, level || 0)); },   // 0 dry .. 1 heavy: how loud the rain voice is
  _debug: function () { return { ctx: ctx, song: song, G: G, stale: stale, amb: Object.keys(amb).filter(function (n) { return amb[n]; }), vol: vol }; }
};
