// Οκτώηχος · μηχανή φωνής με αληθινά δείγματα (χορωδία) και ακουστική ναού · έκδοση 21-10-2026 (v24: καθαρή φωνή Ψάλτη)
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
    if (PS_KEYS[key]) return psLine(key, level);
    let lastEnd = -1, lastHz = 0, lastS = null;
    const lg = ctx.createGain(); lg.gain.value = level; lg.connect(bus);
    return {
      level: level,
      note(t, f, dur, opts) {
        if (!bufs[key]) return;
        opts = opts || {};
        const legato = !opts.detached && lastEnd > 0 && t - lastEnd < 0.03;
        // (20-10-2026) σε γρήγορες νότες (γοργά, τρίγοργα) μένει στο ίδιο δείγμα: δεν αλλάζει χροιά «σαν άλλο όργανο»
        let s = pick(key, f);
        if (legato && lastS && Math.abs(12 * Math.log2(f / lastS.hz)) < 4.5) s = lastS;
        const rate = f / s.hz;
        const from = legato && lastHz ? (lastHz / s.hz) : rate;
        const L = s.buf.duration;
        const short = dur < 0.3;
        const first0 = (legato || short) ? 0.22 : 0.02;           // στη σύνδεση και στις σύντομες νότες παραλείπουμε την «επίθεση»
        const fadeIn = legato ? (short ? 0.03 : 0.07) : (opts.soft ? 0.25 : (short ? 0.03 : 0.06));
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
        lastEnd = end; lastHz = f; lastS = s;
      },
      rest() { lastEnd = -1; lastHz = 0; lastS = null; },
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


  // ================= (21-10-2026, v24) Φωνή «Ψάλτης»: μία καθαρή φωνή =================
  // Χρησιμοποιεί ΜΟΝΟ τις ηχογραφήσεις με το ίδιο φωνήεν («α/ο», 116–151 Hz). Για κάθε άλλο ύψος η φωνή
  // ξαναχτίζεται κύμα-κύμα (PSOLA): αλλάζει το ύψος χωρίς να αλλάζει το «χρώμα» της φωνής — δεν λεπταίνει,
  // δεν γίνεται όργανο, δεν ακούγονται δεύτερες φωνές. Οι δεμένες νότες συνεχίζουν το ίδιο κύμα χωρίς ραφές.
  const PS_KEYS = { psaltis: { maxHz: 155 } };
  const psSrc = {};
  function psMarks(x, sr, hz) {
    // κάθε περίοδος της φωνής: βρίσκουμε το «χτύπημα» της (κορυφή του χαμηλού κύματος)
    const P = sr / hz, n = x.length, lp = new Float32Array(n);
    const a = Math.exp(-2 * Math.PI * hz * 1.3 / sr); let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { y1 = (1 - a) * x[i] + a * y1; y2 = (1 - a) * y1 + a * y2; lp[i] = y2; }
    const marks = []; let best = Math.round(P), bv = -1e9;
    for (let i = Math.round(P); i < Math.round(2 * P); i++) if (lp[i] > bv) { bv = lp[i]; best = i; }
    let prev = best, per = P; marks.push(best);
    while (true) {
      const c = prev + per, lo = Math.round(c - 0.22 * P), hi = Math.round(c + 0.22 * P);
      if (hi >= n - Math.round(P)) break;
      let m = lo, mv = -1e9;
      for (let i = lo; i <= hi; i++) if (lp[i] > mv) { mv = lp[i]; m = i; }
      const d = m - prev; if (d > 0.75 * P && d < 1.3 * P) per = 0.8 * per + 0.2 * d;
      marks.push(m); prev = m;
    }
    return { marks: Int32Array.from(marks), P };
  }
  function psPrep(key) {
    if (psSrc[key]) return psSrc[key];
    const arr = bufs[key]; if (!arr) return null;
    const lim = PS_KEYS[key].maxHz;
    let use = arr.filter(s => s.hz <= lim); if (!use.length) use = arr.slice();
    const out = use.map(s => {
      const x = s.buf.getChannelData(0), sr = s.buf.sampleRate, mk = psMarks(x, sr, s.hz);
      let lo = 0, hi = mk.marks.length - 1;                       // μένουμε στο σταθερό μέρος (χωρίς αρχή/τέλος της ηχογράφησης)
      while (lo < hi && mk.marks[lo] < 0.18 * sr) lo++;
      while (hi > lo && mk.marks[hi] > x.length - 0.18 * sr) hi--;
      let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
      return { hz: s.hz, sr, x, marks: mk.marks, P: mk.P, lo, hi, rms: Math.sqrt(e / x.length) || 0.25 };
    }).sort((a, b) => a.hz - b.hz);
    const ref = out.reduce((a, s) => a + s.rms, 0) / out.length;
    out.forEach(s => s.norm = ref / s.rms);
    out.sr = out[0].sr; psSrc[key] = out; return out;
  }
  function psPick(srcs, f) { let b = srcs[0], bd = 1e9; for (const s of srcs) { const d = Math.abs(Math.log(f / s.hz)); if (d < bd) { bd = d; b = s; } } return b; }
  // Ζωγραφίζει τα κύματα από τη στιγμή tA ως tB (δευτερόλεπτα του ήχου). fOf(t): ύψος, envOf(t): ένταση.
  function psRender(st, srcs, tA, tB, fOf, envOf) {
    const sr = srcs.sr, Hmax = Math.ceil(sr / srcs[0].hz) + 2;
    const t0 = Math.min(tA, st.next) - Hmax / sr;
    const N = Math.max(1, Math.ceil((tB - t0) * sr) + Hmax + 2), out = new Float32Array(N);
    let tm = Math.max(st.next, tA - 0.5);
    while (tm < tB) {
      const f = fOf(tm), S = st.src || psPick(srcs, f);
      // θέση μέσα στην ηχογράφηση: προχωρά με τον φυσικό χρόνο, και γυρίζει πίσω-μπρος (χωρίς «ραφή»)
      const M = S.marks, span = M[S.hi] - M[S.lo];
      let pos = M[S.lo] + st.frac * span;
      let lo = S.lo, hi = S.hi;
      while (hi - lo > 1) { const md = (lo + hi) >> 1; if (M[md] <= pos) lo = md; else hi = md; }
      const k = (pos - M[lo] < M[hi] - pos) ? lo : hi, m = M[k];
      const H = Math.round(S.P), Pout = sr / f;
      const g = envOf(tm) * Math.min(2, Pout / S.P) * S.norm;
      const c = Math.round((tm - t0) * sr);
      if (g > 1e-5) for (let j = -H; j <= H; j++) {
        const q = m + j, o = c + j; if (q < 0 || q >= S.x.length || o < 0 || o >= N) continue;
        out[o] += S.x[q] * g * (0.5 + 0.5 * Math.cos(Math.PI * j / (H + 1)));
      }
      tm += 1 / f;
      st.frac += st.dir * (Pout / span);
      if (st.frac > 1) { st.frac = 2 - st.frac; st.dir = -1; } else if (st.frac < 0) { st.frac = -st.frac; st.dir = 1; }
    }
    st.next = tm;
    return { t0, data: out };
  }
  function psPlay(rd, sr, dest, recSet) {
    const b = ctx.createBuffer(1, rd.data.length, sr); b.getChannelData(0).set(rd.data);
    const src = ctx.createBufferSource(); src.buffer = b;
    const g = ctx.createGain(); g.gain.value = 1; src.connect(g); g.connect(dest);
    const st = Math.max(ctx.currentTime, rd.t0);
    src.start(st, Math.max(0, st - rd.t0)); src.stop(rd.t0 + b.duration + 0.02);
    const rec = { src, g }; active.add(rec);
    src.onended = () => { active.delete(rec); try { src.disconnect(); g.disconnect(); } catch (e) { } };
    return rec;
  }
  function psLine(key, level) {
    const lg = ctx.createGain(); lg.gain.value = level; lg.connect(bus);
    let st = null, lastEnd = -1, lastF = 0, tail = null;
    return {
      level: level,
      note(t, f, dur, opts) {
        const srcs = psPrep(key); if (!srcs) return;
        opts = opts || {};
        const legato = !opts.detached && st && lastEnd > 0 && Math.abs(t - lastEnd) < 0.03;
        if (legato && tail) { try { tail.src.stop(0); } catch (e) { } try { tail.g.disconnect(); } catch (e) { } active.delete(tail); tail = null; }
        if (!legato) { st = { next: t, frac: 0.15 + Math.random() * 0.7, dir: 1, src: null }; lastF = 0; }
        const from = legato && lastF ? lastF : f, end = t + dur;
        const up = f * Math.pow(2, 12 / 72), pet = !!opts.pet;
        const fOf = tt => {
          const x = tt - t;
          let v = from === f ? f : f * Math.pow(from / f, Math.exp(-Math.max(0, x) / 0.03));    // ομαλό δέσιμο με την προηγούμενη νότα
          if (pet && x > 0.05 && x < 0.2) { const w = Math.sin(Math.PI * (x - 0.05) / 0.15); v *= Math.pow(up / f, w); }  // πεταστή: σύντομο τίναγμα προς τα πάνω
          return v;
        };
        const fin = legato ? 0 : (opts.soft ? 0.25 : 0.05);
        const envOf = tt => fin ? Math.min(1, Math.max(0, (tt - t) / fin)) : 1;
        st.src = psPick(srcs, f);
        const rd = psRender(st, srcs, t, end, fOf, envOf);
        psPlay(rd, srcs.sr, lg);
        // «ουρά»: αν δεν ακολουθήσει δεμένη νότα, η φωνή σβήνει απαλά
        const tl = opts.tail != null ? opts.tail : 0.12, save = { next: st.next, frac: st.frac, dir: st.dir, src: st.src };
        const rt = psRender(save, srcs, end, end + tl, fOf, tt => Math.max(0, 1 - (tt - end) / tl));
        tail = psPlay(rt, srcs.sr, lg);
        lastEnd = end; lastF = f;
      },
      rest() { st = null; lastEnd = -1; lastF = 0; tail = null; },
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

  window.Foni = { setup, load, has, line, piano, stopAll, setReverb, _ps: { psMarks, psPrep, psRender, psSrc }, input: () => bus, sets: () => Object.keys(window.FONI_SETS || {}) };
})();
