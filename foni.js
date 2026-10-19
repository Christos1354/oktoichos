// Οκτώηχος · μηχανή φωνής με αληθινά δείγματα (χορωδία) και ακουστική ναού · έκδοση 19-10-2026 (γ, με πιάνο)
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
    for (const k in bufs) delete bufs[k];
    for (const k in loading) delete loading[k];
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

  // Μία νότα: πρώτα η δική μας αποκωδικοποίηση (ADPCM, δουλεύει παντού, και στο iPhone).
  // Μόνο για παλιά δεδομένα mp3 χρησιμοποιεί τον browser, με όριο χρόνου ώστε να μην «κολλάει» ποτέ.
  function decodeNote(n) {
    if (n.adpcm && window.FONI_ADPCM) {
      try { return Promise.resolve({ hz: n.hz, buf: window.FONI_ADPCM(ctx, n) }); } catch (e) { return Promise.resolve(null); }
    }
    if (!n.b64) return Promise.resolve(null);
    return new Promise(res => {
      let done = false; const fin = v => { if (!done) { done = true; res(v); } };
      setTimeout(() => fin(null), 8000);
      try {
        const p = ctx.decodeAudioData(b64ToBuf(n.b64), b => fin({ hz: n.hz, buf: b }), () => fin(null));
        if (p && p.catch) p.catch(() => fin(null));
      } catch (e) { fin(null); }
    });
  }

  function load(key) {
    if (bufs[key]) return Promise.resolve(bufs[key]);
    if (loading[key]) return loading[key];
    const S = window.FONI_SETS && window.FONI_SETS[key];
    if (!S || !ctx) return Promise.reject(new Error("no set"));
    loading[key] = Promise.all(S.notes.map(decodeNote)).then(arr => {
      arr = arr.filter(Boolean);
      if (!arr.length) { delete loading[key]; throw new Error("choir not decoded"); }
      bufs[key] = arr; bufs[key].ctx = ctx; return arr;
    });
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
    src.onended = () => { active.delete(rec); try { src.disconnect(); g.disconnect(); } catch (e) { } };   // καθάρισμα
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

  // (19-10-2026) Πιάνο: κάθε νότα «χτυπιέται» και σβήνει σιγά-σιγά, όπως στο πιάνο (χωρίς δείγματα, ακριβές σε κάθε μόριο)
  let hammer = null;
  function piano(level) {
    const lg = ctx.createGain(); lg.gain.value = level; lg.connect(bus);
    if (!hammer || hammer.sampleRate !== ctx.sampleRate) {
      hammer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const d = hammer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    return {
      level: level,
      note(t, f, dur) {
        const end = t + Math.max(0.15, dur), dec = Math.max(0.7, 3.4 * Math.pow(110 / f, 0.35));
        const out = ctx.createGain(); out.gain.value = 0; out.connect(lg);
        out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.9, t + 0.006);
        out.gain.setTargetAtTime(0.0001, t + 0.006, dec / 3);
        out.gain.setTargetAtTime(0, end, 0.09);
        const osc = [], amps = [1, 0.5, 0.3, 0.2, 0.11, 0.07, 0.045], B = 0.0004;
        amps.forEach((a, i) => {
          const n = i + 1, fr = f * n * Math.sqrt(1 + B * n * n); if (fr > ctx.sampleRate / 2 - 500) return;
          const o = ctx.createOscillator(); o.frequency.value = fr;
          const g = ctx.createGain(); g.gain.setValueAtTime(a, t); g.gain.setTargetAtTime(a * 0.2, t + 0.01, dec / (1.5 + n));
          o.connect(g); g.connect(out); o.start(t); o.stop(end + 0.7); osc.push(o);
        });
        const hs = ctx.createBufferSource(); hs.buffer = hammer; const hf = ctx.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = Math.min(4000, f * 6); hf.Q.value = 0.8;
        const hg = ctx.createGain(); hg.gain.value = 0.18; hs.connect(hf); hf.connect(hg); hg.connect(out); hs.start(t);
        const rec = { src: { stop: w => osc.forEach(o => { try { o.stop(w); } catch (e) { } }) }, g: out };
        active.add(rec);
        if (osc[0]) osc[0].onended = () => { active.delete(rec); try { out.disconnect(); } catch (e) { } };
      },
      rest() { },
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

  window.Foni = { setup, load, has, line, piano, stopAll, setReverb, input: () => bus, sets: () => Object.keys(window.FONI_SETS || {}) };
})();
