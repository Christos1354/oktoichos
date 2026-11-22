// Οκτώηχος · Christos S Magides · 22-11-2026 · ΧΩΡΙΣ ΙΝΤΕΡΝΕΤ
// Κατεβάζει ΟΛΑ τα αρχεία της εφαρμογής (σελίδες, αναγνώστη, φωνές, απηχήματα) στη συσκευή,
// ώστε να ανοίγει και να ψάλλει μέσα στην εκκλησία χωρίς σύνδεση.
(function(){
  var CACHE="oktoichos-v31";   // ίδιο όνομα με το sw.js
  var FILES=["anagnostis-vivlion.js", "apech-a.mp3", "apech-b.mp3", "apech-d.mp3", "apech-dl.mp3", "apech-g.mp3", "apech-pa.mp3", "apech-pb.mp3", "apech-pd.mp3", "apech-v.mp3", "foni-christos-aa.js", "foni-christos-logia.js", "foni-christos-mm.js", "foni-christos-par.js", "foni-christos.js", "foni-psaltis.js", "foni-xorodia.js", "foni.js", "icons/apple-touch-icon.png", "icons/favicon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "manifest.webmanifest", "ocr/lang/ell.traineddata.wasm", "ocr/lang/grc.traineddata.wasm", "ocr/tesseract-core-lstm.wasm.js", "ocr/tesseract-core-relaxedsimd-lstm.wasm.js", "ocr/tesseract-core-simd-lstm.wasm.js", "ocr/tesseract.min.js", "ocr/worker-wrap.js", "ocr/worker.min.js", "papline.html", "pdfjs/pdf.min.js", "pdfjs/pdf.worker.min.js", "selida-allilouia.html", "selida-esperinos-2-8.html", "selida-megali-paraskevi.html", "selida-simeron.html", "selida-vivlio.html"];
  function key(p){ return new Request(location.origin+location.pathname.replace(/[^/]*$/,"")+p); }
  async function status(){
    if(!("caches" in window)) return {have:0,total:FILES.length};
    var c=await caches.open(CACHE), have=0;
    for(var i=0;i<FILES.length;i++){ var p=FILES[i]; var hit=await c.match(key(p),{ignoreSearch:true})||await caches.match(key(p),{ignoreSearch:true}); if(hit) have++; }
    return {have:have,total:FILES.length};
  }
  async function prepare(onp){
    if(!("caches" in window)) throw new Error("Αυτός ο browser δεν μπορεί να κρατήσει την εφαρμογή.");
    try{ if(navigator.storage&&navigator.storage.persist) await navigator.storage.persist(); }catch(e){}
    var c=await caches.open(CACHE), ok=0, bad=[];
    for(var i=0;i<FILES.length;i++){
      var p=FILES[i]; if(onp) onp(i,FILES.length,p);
      try{ var r=await fetch(p,{cache:"reload"}); if(!r.ok) throw 0; await c.put(key(p),r); ok++; }
      catch(e){ var old=await caches.match(key(p),{ignoreSearch:true}); if(old) ok++; else bad.push(p); }
    }
    try{ localStorage.setItem("okt-offline-at",String(Date.now())); }catch(e){}
    if(onp) onp(FILES.length,FILES.length,"");
    return {ok:ok,total:FILES.length,bad:bad};
  }
  window.oktOffline={prepare:prepare,status:status,FILES:FILES};
})();
