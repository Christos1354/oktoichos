// Οκτώηχος · μηχανή φωνής με αληθινά δείγματα (χορωδία) και ακουστική ναού
// Χρήση: Foni.setup(ctx); await Foni.load(key); const L=Foni.line(key,level); L.note(t,hz,dur,{pet}); Foni.stopAll();
(function () {
  "use strict";
  let ctx = null, bus = null, out = null, wetG = null;
  const bufs = {}, loading = {};
  const active = new Set();
  let reverb = 0.3;

  function makeIR(c, secs) {
    const len = Math.floor(c.sampleRate * secs), pre = Math.floor(c.sampleRate * 0.022);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / c.sampleRate;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.35 - 0.25 * Math.min(1, t / secs)); // πιο σκοτεινή ουρά, όπως σε ναό
        d[i] = lp * Math.exp(-t * 2.6);
      }
    }
    return ir;
  }

  function setup(c) {
    if (ctx === c && bus) return;
    ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    out = c.createGain(); out.gain.value = 0.9;
    out.connect(comp); comp.connect(c.destination);
    bus = c.createGain(); bus.gain.value = 1;
    const dry = c.createGain(); dry.gain.value = 1;
    const conv = c.createConvolver(); conv.buffer = makeIR(c, 2.8);
    wetG = c.createGain(); wetG.gain.value = reverb;
    bus.connect(dry); dry.connect(out);
    bus.connect(conv); conv.connect(wetG); wetG.connect(out);
  }

  function setReverb(v) { reverb = v; if (wetG && ctx) wetG.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }

  function b64ToBuf(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function has(key) { return !!(window.FONI_SETS && window.FONI_SETS[key]); }

  function load(key) {
    if (bufs[key]) return Promise.resolve(bufs[key]);
    if (loading[key]) return loading[key];
    const S = window.FONI_SETS[key];
    loading[key] = Promise.all(S.notes.map(n => new Promise((res, rej) => {
      ctx.decodeAudioData(b64ToBuf(n.b64), b => res({ hz: n.hz, buf: b }), rej);
    }))).then(arr => { bufs[key] = arr; return arr; });
    return loading[key];
  }

  function pick(key, f) {
    const arr = bufs[key]; let best = arr[0], bd = 1e9;
    for (const s of arr) { const d = Math.abs(Math.log(f / s.hz)); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // Ένα κομμάτι ήχου με εμφάνιση/εξαφάνιση
  function segment(s, rateFrom, rate, t0, t1, offset, fadeIn, fadeOut, level, opts, dest) {
    const src = ctx.createBufferSource(); src.buffer = s.buf;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(dest || bus);
    const P = src.playbackRate;
    const pre = 0.03;                       // ξεκινά λίγο νωρίτερα, σιωπηλά
    P.setValueAtTime(rateFrom, Math.max(0, t0 - pre));
    if (rateFrom !== rate) P.setTargetAtTime(rate, t0, 0.03);
    if (opts && opts.pet) { const up = rate * Math.pow(2, 12 / 72); P.setTargetAtTime(up, t0 + 0.06, 0.018); P.setTargetAtTime(rate, t0 + 0.15, 0.025); }
    g.gain.setValueAtTime(0, Math.max(0, t0 - pre));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + fadeIn);
    g.gain.setValueAtTime(level, Math.max(t0 + fadeIn, t1));
    g.gain.linearRampToValueAtTime(0, t1 + fadeOut);
    const st0 = Math.max(0, t0 - pre);
    src.start(st0, Math.max(0, offset - (t0 - st0) * rateFrom));
    src.stop(t1 + fadeOut + 0.05);
    const rec = { src, g };
    active.add(rec);
    src.onended = () => active.delete(rec);
    return rec;
  }

  // Μια «γραμμή» φωνής (μελωδία ή ίσον): κάθε νότα δένει με την προηγούμενη
  function line(key, level) {
    let lastEnd = -1, lastHz = 0;
    const lg = ctx.createGain(); lg.gain.value = level; lg.connect(bus);
    return {
      level: level,
      note(t, f, dur, opts) {
        if (!bufs[key]) return;
        opts = opts || {};
        const s = pick(key, f), rate = f / s.hz;
        const legato = !opts.detached && lastEnd > 0 && t - lastEnd < 0.03;
        const from = legato && lastHz ? (lastHz / s.hz) : rate;
        const L = s.buf.duration;
        const first0 = legato ? 0.22 : 0.02;           // στη σύνδεση παραλείπουμε την «επίθεση» του δείγματος
        const fadeIn = legato ? 0.07 : (opts.soft ? 0.25 : 0.06);
        const tail = opts.tail != null ? opts.tail : 0.09;
        const usable = (L - 0.15) / rate;              // πόσα δευτερόλεπτα δίνει ένα δείγμα σε αυτό το ύψος
        let ts = t, off = first0, first = true;
        const end = t + dur;
        while (true) {
          const segLen = usable - off / rate;
          const te = Math.min(end, ts + Math.max(0.3, segLen - 0.3));
          const last = te >= end - 1e-6;
          segment(s, first ? from : rate, rate, ts, te, off, first ? fadeIn : 0.3, last ? tail : 0.3, 1, first ? opts : null, lg);
          if (last) break;
          ts = te; off = 0.35 + Math.random() * 0.2; first = false; // συνέχεια με διασταύρωση (για μεγάλες νότες και ίσον)
        }
        lastEnd = end; lastHz = f;
      },
      rest() { lastEnd = -1; lastHz = 0; },
      setLevel(v) { this.level = v; lg.gain.setTargetAtTime(v, ctx.currentTime, 0.08); }
    };
  }

  function stopAll(fade) {
    if (!ctx) return;
    const t = ctx.currentTime, f = fade == null ? 0.06 : fade;
    active.forEach(r => {
      try { r.g.gain.cancelScheduledValues(t); r.g.gain.setValueAtTime(r.g.gain.value, t); r.g.gain.linearRampToValueAtTime(0, t + f); r.src.stop(t + f + 0.05); } catch (e) { }
    });
    active.clear();
  }

  window.Foni = { setup, load, has, line, stopAll, setReverb, input: () => bus, sets: () => Object.keys(window.FONI_SETS || {}) };
})();
