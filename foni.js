// Οκτώηχος · μηχανή φωνής με αληθινά δείγματα (χορωδία) και ακουστική ναού · έκδοση 22-10-2026 (v29: η φωνή του Χρίστου «α» και «μμμ»)
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

  function alias() { const F = window.FONI_SETS; if (!F || !F.psaltis) return;
    [["psaltis_v", "Ψάλτης με λόγια"], ["psaltis_o", "Ψάλτης «ο»"], ["psaltis_e", "Ψάλτης «ε»"], ["psaltis_m", "Ψάλτης «μμμ»"]].forEach(([k, n]) => { if (!F[k]) F[k] = { name: n, notes: F.psaltis.notes }; }); }
  alias();
  function has(key) { alias(); return !!(window.FONI_SETS && window.FONI_SETS[key]); }

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
    alias(); const S = window.FONI_SETS && window.FONI_SETS[key];
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


  // ================= Φωνή «Ψάλτης» (v24 21-10-2026 · v25 22-10-2026) =================
  // «Ψάλτης»: ΜΙΑ ηχογράφηση μόνο (το καθαρό «α» στα 116 Hz). Κάθε άλλο ύψος χτίζεται κύμα-κύμα (PSOLA):
  //   αλλάζει μόνο το ύψος, ποτέ το χρώμα — δεν λεπταίνει, δεν γίνεται όργανο, δεν μπαίνουν άλλες φωνές.
  // «Ψάλτης με λόγια»: η ίδια φωνή, που σε κάθε συλλαβή λέει το φωνήεν της (α, ε, ι, ο) και κάνει
  //   ένα μικρό «άρθρωμα» στην αρχή κάθε νέας συλλαβής, ώστε να ξεχωρίζουν οι συλλαβές.
  const PS_KEYS = { psaltis: { mode: "plain" }, psaltis_v: { mode: "vowel" },
    christos: { mode: "plain", multi: 1 }, christos_m: { mode: "plain", multi: 1 },   // (23-10-2026) η φωνή του Χρίστου
    psaltis_o: { mode: "plain", v: "o" }, psaltis_e: { mode: "plain", v: "e" }, psaltis_m: { mode: "plain", v: "a", hum: 1 } };   // (22-10-2026) ένα φωνήεν: «α», «ο», «ε», «μμμ»
  const VOWEL_HZ = { a: 115.866, o: 140.382, u: 140.382, e: 171.512, i: 225.575 };   // ποια ηχογράφηση έχει ποιο φωνήεν (μετρημένο)
  const psCache = new Map();   // ανά ηχογράφηση
  function psMarks(x, sr, hz) {
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
  function psOne(s) {
    if (psCache.has(s.buf)) return psCache.get(s.buf);
    const x = s.buf.getChannelData(0), sr = s.buf.sampleRate, mk = psMarks(x, sr, s.hz);
    let lo = 0, hi = mk.marks.length - 1;
    const cut = Math.min(0.18 * sr, 0.12 * x.length);   // (23-10-2026) και για σύντομες νότες
    while (lo < hi && mk.marks[lo] < cut) lo++;
    while (hi > lo && mk.marks[hi] > x.length - cut) hi--;
    let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    const o = { hz: s.hz, sr, x, marks: mk.marks, P: mk.P, lo, hi, rms: Math.sqrt(e / x.length) || 0.25 };
    psCache.set(s.buf, o); return o;
  }
  function psPrep(key) {
    const arr = bufs[key]; if (!arr) return null;
    if (arr._ps) return arr._ps;
    const all = arr.map(psOne).sort((a, b) => a.hz - b.hz);
    const near = hz => all.reduce((b, s) => Math.abs(Math.log(s.hz / hz)) < Math.abs(Math.log(b.hz / hz)) ? s : b, all[0]);
    const V = {}; for (const v in VOWEL_HZ) V[v] = near(VOWEL_HZ[v]);
    const ref = V.a.rms; for (const v in V) V[v].norm = ref / V[v].rms;
    if (PS_KEYS[key].multi) { const ref = all.reduce((a, s) => a + s.rms, 0) / all.length; all.forEach(s => s.norm = ref / s.rms); }
    const out = { sr: all[0].sr, V, all, near, multi: !!PS_KEYS[key].multi, mode: PS_KEYS[key].mode, fixed: PS_KEYS[key].v || "a", hum: !!PS_KEYS[key].hum, minHz: Math.min(...all.map(s => s.hz)) };
    arr._ps = out; return out;
  }
  function psGrain(out, N, c, S, m, g) {
    const H = Math.round(S.P);
    for (let j = -H; j <= H; j++) {
      const q = m + j, o = c + j; if (q < 0 || q >= S.x.length || o < 0 || o >= N) continue;
      out[o] += S.x[q] * g * (0.5 + 0.5 * Math.cos(Math.PI * j / (H + 1)));
    }
  }
  function psMark(S, frac) {
    const M = S.marks, span = M[S.hi] - M[S.lo], pos = M[S.lo] + frac * span;
    let lo = S.lo, hi = S.hi;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (M[md] <= pos) lo = md; else hi = md; }
    return (pos - M[lo] < M[hi] - pos) ? M[lo] : M[hi];
  }
  // Ζωγραφίζει τα κύματα από tA ως tB. st.src: φωνήεν τώρα, st.prev/st.xfA/st.xfB: μετάβαση από το προηγούμενο φωνήεν
  function psRender(st, P, tA, tB, fOf, envOf) {
    const sr = P.sr, Hmax = Math.ceil(sr / P.minHz) + 2;
    const t0 = Math.min(tA, st.next) - Hmax / sr;
    const N = Math.max(1, Math.ceil((tB - t0) * sr) + Hmax + 2), out = new Float32Array(N);
    let tm = Math.max(st.next, tA - 0.5);
    while (tm < tB) {
      const f = fOf(tm), S = st.src, Pout = sr / f, c = Math.round((tm - t0) * sr);
      const g = envOf(tm);
      let w = 0;
      if (st.prev && tm < st.xfB) w = tm <= st.xfA ? 1 : (st.xfB - tm) / (st.xfB - st.xfA);
      if (g > 1e-5) {
        if (w < 1) psGrain(out, N, c, S, psMark(S, st.frac), g * (1 - w) * Math.min(2, Pout / S.P) * S.norm);
        if (w > 0) { const Q = st.prev; psGrain(out, N, c, Q, psMark(Q, st.frac), g * w * Math.min(2, Pout / Q.P) * Q.norm); }
      }
      tm += 1 / f;
      // η θέση μέσα στην ηχογράφηση προχωρά με τον φυσικό χρόνο και γυρίζει πίσω-μπρος (χωρίς «ραφή»)
      st.frac += st.dir * (Pout / (S.marks[S.hi] - S.marks[S.lo]));
      if (st.frac > 1) { st.frac = 2 - st.frac; st.dir = -1; } else if (st.frac < 0) { st.frac = -st.frac; st.dir = 1; }
    }
    st.next = tm;
    return { t0, data: out };
  }
  function psPlay(rd, sr, dest) {
    const b = ctx.createBuffer(1, rd.data.length, sr); b.getChannelData(0).set(rd.data);
    const src = ctx.createBufferSource(); src.buffer = b;
    const g = ctx.createGain(); g.gain.value = 1; src.connect(g); g.connect(dest);
    const st = Math.max(ctx.currentTime, rd.t0);
    src.start(st, Math.max(0, st - rd.t0)); src.stop(rd.t0 + b.duration + 0.02);
    const rec = { src, g }; active.add(rec);
    src.onended = () => { active.delete(rec); try { src.disconnect(); g.disconnect(); } catch (e) { } };
    return rec;
  }
  // φωνήεν μιας συλλαβής (ελληνικά, με ή χωρίς τόνους)
  function vowelOf(syl) {
    const x = String(syl || "").normalize("NFD").replace(/[̀-ͯͅ]/g, "").toLowerCase();
    if (/ου/.test(x)) return "u";
    if (/αι/.test(x)) return "e";
    if (/ει|οι|υι/.test(x)) return "i";
    for (const ch of x) { if (ch === "α") return "a"; if (ch === "ε") return "e"; if ("ηιυ".includes(ch)) return "i"; if ("οω".includes(ch)) return "o"; }
    return null;
  }
  // ================= (22-10-2026, v26) Λόγια: ελληνική προφορά → σύμφωνα =================
  // Η συλλαβή χωρίζεται σε: αρχικά σύμφωνα · φωνήεν · τελικά σύμφωνα (π.χ. «σον» = σ · ο · ν).
  const VOW = "αεηιουω";
  const DIG_V = [["ου", "u"], ["αι", "e"], ["ει", "i"], ["οι", "i"], ["υι", "i"], ["αυ", "a+"], ["ευ", "e+"], ["ηυ", "i+"]];
  const DIG_C = [["μπ", "b"], ["ντ", "d"], ["γκ", "g"], ["γγ", "g"], ["τσ", "ts"], ["τζ", "dz"]];
  const ONE_C = { π: "p", τ: "t", κ: "k", β: "v", γ: "gh", δ: "dh", ζ: "z", θ: "th", λ: "l", μ: "m", ν: "n", ξ: "ks", ρ: "r", σ: "s", ς: "s", φ: "f", χ: "x", ψ: "ps" };
  const ONE_V = { α: "a", ε: "e", η: "i", ι: "i", υ: "i", ο: "o", ω: "o" };
  function consList(str) {
    const out = [];
    for (let i = 0; i < str.length;) {
      const two = str.slice(i, i + 2), d = DIG_C.find(x => x[0] === two);
      if (d) { out.push(d[1]); i += 2; continue; }
      const c = ONE_C[str[i]]; if (c) { if (c === "ks") out.push("k", "s"); else if (c === "ps") out.push("p", "s"); else out.push(c); }
      i++;
    }
    return out;
  }
  function parseSyl(syl) {
    const x = String(syl || "").normalize("NFD").replace(/[̀-ͯͅ]/g, "").toLowerCase().replace(/[^α-ως]/g, "");
    let i = 0; while (i < x.length && VOW.indexOf(x[i]) < 0) i++;
    if (i >= x.length) return { on: consList(x), v: null, co: [] };
    const two = x.slice(i, i + 2); let v, j;
    const dv = DIG_V.find(d => d[0] === two);
    if (dv) { v = dv[1]; j = i + 2; } else { v = ONE_V[x[i]]; j = i + 1; }
    let co = consList(x.slice(j));
    if (v.endsWith("+")) { v = v[0]; const nx = co[0]; co.unshift(nx && /^(p|t|k|f|th|s|x|ts)$/.test(nx) ? "f" : "v"); }   // αυ/ευ: αβ/αφ
    return { on: consList(x.slice(0, i)), v, co };
  }
  // κάθε σύμφωνο: διάρκεια (s), πόση φωνή μένει, φίλτρο φωνής, θόρυβος [συχνότητα, Q, ένταση], «σκάσιμο»
  const PH = {
    p: { d: .055, vg: 0, burst: [900, 1, .22] }, t: { d: .055, vg: 0, burst: [4500, 1.2, .2] }, k: { d: .06, vg: 0, burst: [2300, 1.4, .24] },
    b: { d: .05, vg: .22, lp: 280, burst: [700, 1, .08] }, d: { d: .05, vg: .22, lp: 280, burst: [3500, 1, .08] }, g: { d: .05, vg: .22, lp: 280, burst: [2000, 1, .09] },
    f: { d: .075, vg: 0, nz: [3500, .5, .045] }, th: { d: .07, vg: 0, nz: [5200, .7, .035] }, s: { d: .085, vg: 0, nz: [6200, 1.3, .11] }, x: { d: .075, vg: 0, nz: [1700, 1.6, .075] },
    ts: { d: .085, vg: 0, burst: [4500, 1.2, .16], nz: [6200, 1.3, .1] }, dz: { d: .075, vg: .25, lp: 600, burst: [3500, 1, .06], nz: [5600, 1.3, .045] },
    v: { d: .055, vg: .42, lp: 900, nz: [2500, .5, .012] }, dh: { d: .05, vg: .4, lp: 1100, nz: [4500, .7, .012] }, gh: { d: .05, vg: .45, lp: 1300, nz: [1800, 1, .015] },
    z: { d: .07, vg: .3, lp: 600, nz: [5600, 1.3, .05] },
    m: { d: .065, vg: .5, lp: 330 }, n: { d: .06, vg: .5, lp: 380 }, l: { d: .045, vg: .7, lp: 1500 }, r: { d: .03, vg: 1, tap: 1 }
  };
  const VOICED_FREE = { m: 1, n: 1, l: 1, r: 1, v: 1, dh: 1, gh: 1, z: 1 };
  // πρόγραμμα συμφώνων μέσα στη νότα: [αρχή, τέλος, φθόγγος] (σε δευτερόλεπτα από την αρχή της νότας)
  function plan(on, co, dur) {
    const segs = [];
    const fit = (list, room) => { let tot = list.reduce((a, c) => a + (PH[c] ? PH[c].d : 0), 0); return tot > room ? room / tot : 1; };
    if (on.length) { const k = fit(on, Math.max(0.04, dur * 0.42)); let x = 0; for (const c of on) { if (!PH[c]) continue; const d = PH[c].d * k; segs.push([x, x + d, c]); x += d; } }
    if (co.length) { const k = fit(co, Math.max(0.04, dur * 0.35)); let tot = co.reduce((a, c) => a + (PH[c] ? PH[c].d * k : 0), 0), x = dur - tot; for (const c of co) { if (!PH[c]) continue; const d = PH[c].d * k; segs.push([x, x + d, c]); x += d; } }
    return segs;
  }
  function voiceGain(segs, x) {   // πόση φωνή (φωνήεν) ακούγεται τη στιγμή x
    let g = 1;
    for (const [a, b, c] of segs) {
      const P = PH[c], r = 0.008;
      if (x < a - r || x > b + r) continue;
      let w = x < a ? (x - (a - r)) / r : x > b ? ((b + r) - x) / r : 1;
      let vg = P.vg;
      if (P.tap) { const m = (a + b) / 2; vg = 1 - 0.85 * Math.max(0, 1 - Math.abs(x - m) / ((b - a) / 2)); w = 1; }
      g = Math.min(g, 1 - w * (1 - vg));
    }
    return g;
  }
  // απλά ψηφιακά φίλτρα (RBJ)
  function biq(type, f, Q, sr) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * Q), c = Math.cos(w); let b0, b1, b2;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al; return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
  }
  function runBiq(k, x) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
  function noise(n) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; return a; }
  // βάζει τα σύμφωνα πάνω στον ήχο της νότας (data: ο ήχος, t0: πότε αρχίζει, tN: αρχή νότας)
  function articulate(data, sr, t0, tN, segs) {
    for (const [a, b, c] of segs) {
      const P = PH[c]; const i0 = Math.max(0, Math.round((tN + a - t0) * sr)), i1 = Math.min(data.length, Math.round((tN + b - t0) * sr));
      if (i1 <= i0) continue;
      const pad = Math.round(0.008 * sr), j0 = Math.max(0, i0 - pad), j1 = Math.min(data.length, i1 + pad);
      if (P.lp) {   // η φωνή «κλειστή»: μόνο τα χαμηλά (μ, ν, λ, β…)
        const seg = data.slice(j0, j1), y = runBiq(biq("lp", P.lp, 0.7, sr), runBiq(biq("lp", P.lp, 0.7, sr), seg));
        for (let i = j0; i < j1; i++) { const w = i < i0 ? (i - j0) / pad : i >= i1 ? (j1 - i) / pad : 1; data[i] = data[i] * (1 - w) + y[i - j0] * w * 1.6; }
      }
      if (P.nz) {   // σφύριγμα / θρόισμα
        const n = i1 - i0, z = runBiq(biq("bp", P.nz[0], P.nz[1], sr), noise(n)), at = Math.min(n / 3, 0.012 * sr);
        for (let i = 0; i < n; i++) { const e = Math.min(1, i / at, (n - i) / at); data[i0 + i] += z[i] * P.nz[2] * 4 * e; }
      }
      if (P.burst) {   // «σκάσιμο» στο τέλος του κλεισίματος
        const n = Math.round(0.02 * sr), st = Math.max(0, i1 - Math.round(0.006 * sr)), z = runBiq(biq("bp", P.burst[0], P.burst[1], sr), noise(n));
        for (let i = 0; i < n && st + i < data.length; i++) data[st + i] += z[i] * P.burst[2] * 4 * Math.exp(-i / (0.004 * sr));
      }
    }
  }
  // «μμμ»: κλειστό στόμα — κρατάμε μόνο τα χαμηλά της φωνής (και τα δυναμώνουμε λίγο)
  function humm(data, sr) { const k = biq("lp", 420, 0.75, sr); const y = runBiq(k, runBiq(k, data)); for (let i = 0; i < data.length; i++) data[i] = y[i] * 2.2; }
  const allLines = new Set();
  function psLine(key, level) {
    const lg = ctx.createGain(); lg.gain.value = level; lg.connect(bus);
    let st = null, lastEnd = -1, lastF = 0, tail = null, vow = "a";
    let syl = null, pend = null, timer = null, dead = false;   // «με λόγια»: η νότα περιμένει την επόμενη, για να ξέρει αν τελειώνει η συλλαβή
    function renderNote(n, endsSyl) {
      const P = n.P, { t, f, dur, opts, legato, from } = n;
      if (legato && tail) { try { tail.src.stop(0); } catch (e) { } try { tail.g.disconnect(); } catch (e) { } active.delete(tail); tail = null; }
      const S = P.multi ? P.near(f) : (P.V[P.mode === "vowel" ? n.nv : P.fixed] || P.V.a);
      if (!legato) { st = { next: t, frac: 0.15 + Math.random() * 0.7, dir: 1, src: S, prev: null, xfA: 0, xfB: 0 }; }
      else if (st.src !== S) { st.prev = st.src; st.src = S; st.xfA = t; st.xfB = t + (P.multi ? 0.12 : 0.07); }
      const end = t + dur, up = f * Math.pow(2, 12 / 72), pet = !!opts.pet;
      const fOf = tt => {
        const x = tt - t;
        let v = from === f ? f : f * Math.pow(from / f, Math.exp(-Math.max(0, x) / (P.multi ? 0.065 : 0.03)));   // (23-10-2026) μαλακό γλίστρημα
        if (pet && x > 0.05 && x < 0.2) { const w = Math.sin(Math.PI * (x - 0.05) / 0.15); v *= Math.pow(up / f, w); }
        return v;
      };
      const segs = P.mode === "vowel" ? plan(n.on || [], endsSyl && n.co ? n.co : [], dur) : [];
      const fin = legato ? 0 : (opts.soft ? 0.25 : (segs.length && segs[0][0] === 0 ? 0.015 : 0.05));
      const art = legato && opts.newSyl && P.mode === "vowel" && !(n.on && n.on.length) ? 0.07 : 0;
      const envOf = tt => {
        const x = tt - t;
        let e = fin ? Math.min(1, Math.max(0, x / fin)) : 1;
        if (art) e *= 0.35 + 0.65 * Math.min(1, Math.max(0, x / art));
        if (segs.length) e *= voiceGain(segs, x);
        return e;
      };
      const rd = psRender(st, P, t, end, fOf, envOf);
      if (segs.length) articulate(rd.data, P.sr, rd.t0, t, segs);
      if (P.hum) humm(rd.data, P.sr);
      psPlay(rd, P.sr, lg);
      const coEnd = segs.length && segs[segs.length - 1][1] >= dur - 1e-6 && !VOICED_FREE[segs[segs.length - 1][2]];
      const tl = opts.tail != null ? opts.tail : (coEnd ? 0.02 : 0.12);
      const save = { next: st.next, frac: st.frac, dir: st.dir, src: st.src, prev: st.prev, xfA: st.xfA, xfB: st.xfB };
      const lastG = segs.length ? voiceGain(segs, dur) : 1;
      const rt = psRender(save, P, end, end + tl, fOf, tt => lastG * Math.max(0, 1 - (tt - end) / tl));
      if (P.hum) humm(rt.data, P.sr);
      tail = psPlay(rt, P.sr, lg);
    }
    function flush(endsSyl) { clearTimeout(timer); timer = null; if (pend && !dead) { const n = pend; pend = null; renderNote(n, endsSyl); } }
    const self = {
      level: level,
      note(t, f, dur, opts) {
        const P = psPrep(key); if (!P || dead) return;
        opts = opts || {};
        const legato = !opts.detached && lastEnd > 0 && Math.abs(t - lastEnd) < 0.03 && (st || pend);
        let nv = "a", on = null;
        if (P.mode === "vowel") {
          if (opts.newSyl && opts.syl) { const ps = parseSyl(opts.syl); syl = ps; if (ps.v) nv = ps.v; else nv = vow; on = ps.on; }
          else nv = vow;
        }
        // η προηγούμενη νότα: τελειώνει η συλλαβή της αν αρχίζει νέα (ή αν δεν είναι δεμένη)
        flush(!!opts.newSyl || !legato);
        vow = nv;
        const n = { P, t, f, dur, opts, legato: !!legato, from: legato && lastF ? lastF : f, nv, on, co: syl ? syl.co : null };
        lastEnd = t + dur; lastF = f;
        if (P.mode !== "vowel") { renderNote(n, false); return; }
        if (opts.newSyl) n.co = syl ? syl.co : null;
        pend = n;
        // αν δεν έρθει άλλη νότα εγκαίρως (τέλος ψαλμού), ψάλλεται κανονικά με το τελικό σύμφωνο
        const lead = Math.max(0, (t - ctx.currentTime - 0.35) * 1000);
        timer = setTimeout(() => flush(true), lead);
      },
      rest() { flush(true); st = null; lastEnd = -1; lastF = 0; tail = null; },
      cancel() { dead = true; clearTimeout(timer); pend = null; },
      setLevel(v) { this.level = v; lg.gain.setTargetAtTime(v, ctx.currentTime, 0.08); }
    };
    allLines.add(self);
    return self;
  }

  function stopAll(fade) {
    allLines.forEach(L => { try { L.cancel(); } catch (e) { } }); allLines.clear();
    if (!ctx) return;
    const t = ctx.currentTime, f = fade == null ? 0.06 : fade;
    active.forEach(r => {
      try { r.g.gain.cancelScheduledValues(t); r.g.gain.setValueAtTime(r.g.gain.value, t); r.g.gain.linearRampToValueAtTime(0, t + f); r.src.stop(t + f + 0.05); } catch (e) { }
    });
    active.clear();
  }

  window.Foni = { setup, load, has, line, piano, stopAll, setReverb, _ps: { psMarks, psPrep, psRender, vowelOf, parseSyl, plan }, input: () => bus, sets: () => Object.keys(window.FONI_SETS || {}) };
})();
