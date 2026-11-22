// Οκτώηχος · Christos S Magides · 22-11-2026
// Μεσολαβητής για το papline.gr («Μουσικά Κείμενα», Δημήτριος Ι. Παπαδόπουλος — δωρεάν βιβλία Βυζαντινής Μουσικής).
// Ο browser δεν επιτρέπει σε μια εφαρμογή να κατεβάσει απευθείας από άλλο ιστότοπο, γι' αυτό περνά από εδώ.
//   /api/papline?list=<διαδρομή>   → λίστα βιβλίων και κατηγοριών μιας σελίδας της βιβλιοθήκης (JSON)
//   /api/papline?d=<διαδρομή?download=…> → το ίδιο το PDF
// Επιτρέπονται ΜΟΝΟ σελίδες της βιβλιοθήκης του papline.gr.
const SITE = "https://papline.gr";
const LIB = "/index.php/bibliotheke-downloads";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function okPath(p) {
  return typeof p === "string" && p.startsWith(LIB) && !p.includes("..") && !/[\s<>"']/.test(p);
}
function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function clean(html) {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function json(o, cache) {
  return new Response(JSON.stringify(o), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + (cache || 0), "access-control-allow-origin": "*" } });
}

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  try {
    if (q.has("list")) {
      let p = q.get("list") || LIB;
      try { if (p.startsWith("http")) p = new URL(p).pathname + new URL(p).search; } catch (e) {}
      if (!okPath(p)) return json({ err: "μη επιτρεπτή διεύθυνση" });
      const r = await fetch(SITE + p, { headers: { "user-agent": UA, "accept-language": "el" }, cf: { cacheTtl: 900, cacheEverything: true } });
      if (!r.ok) return json({ err: "το papline.gr απάντησε " + r.status });
      const html = await r.text();
      const files = [], cats = [], seenF = new Set(), seenC = new Set();
      const title = clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i) || ["", ""])[1]);
      const re = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = re.exec(html))) {
        let href = decode(m[1]);
        try { const u = new URL(href, SITE); if (u.hostname.replace(/^www\./, "") !== "papline.gr") continue; href = u.pathname + u.search; } catch (e) { continue; }
        let t = clean(m[2]);
        if (!okPath(href)) continue;
        const dl = href.match(/[?&]download=(\d+)(?::([^&#]*))?/);
        if (dl) {
          // κουμπί «Λήψη/Download» χωρίς τίτλο: παίρνω τον τίτλο που γράφεται λίγο πιο πάνω, αλλιώς από τη διεύθυνση
          if (!t || t.length < 12 || /^(λήψη|ληψη|download|κατέβασμα|προβολή|view|pdf)$/i.test(t)) {
            const before = html.slice(Math.max(0, m.index - 2500), m.index);
            const tm = before.match(/class="[^"]*pd-(?:title|filename|document-title)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|h\d|a)>(?![\s\S]*class="[^"]*pd-(?:title|filename|document-title))/i);
            t = (tm && clean(tm[1])) || (dl[2] ? decodeURIComponent(dl[2]).replace(/-/g, " ") : "") || t || ("Αρχείο " + dl[1]);
          }
          const old = files.find(f => f.id === dl[1]);
          if (old) { if (t.length > old.t.length) old.t = t; continue; }
          seenF.add(dl[1]);
          const dm = t.match(/(\d{2})-(\d{2})-(\d{4})/) || href.match(/(\d{2})-(\d{2})-(\d{4})/);
          files.push({ id: dl[1], t, u: href, date: dm ? dm[3] + "-" + dm[2] + "-" + dm[1] : "" });
        } else if (t && /^\/index\.php\/bibliotheke-downloads\/\d+-[^?#]*$/.test(href) && href !== p) {
          if (seenC.has(href)) continue; seenC.add(href);
          cats.push({ t, u: href });
        }
      }
      return json({ title, page: p, files, cats, at: Date.now() }, 900);
    }
    if (q.has("d")) {
      const p = q.get("d");
      if (!okPath(p) || !/[?&]download=\d+/.test(p)) return new Response("μη επιτρεπτή διεύθυνση", { status: 400 });
      const r = await fetch(SITE + p, { headers: { "user-agent": UA, "referer": SITE + LIB }, redirect: "follow", cf: { cacheTtl: 86400, cacheEverything: true } });
      if (!r.ok) return new Response("το papline.gr απάντησε " + r.status, { status: 502 });
      const ct = r.headers.get("content-type") || "";
      if (q.has("dbg") || /text\/html/i.test(ct)) {
        // δεν ήρθε αρχείο αλλά σελίδα: δείχνω τι έγραφε, για να φανεί τι ζητά το papline.gr
        const html = await r.text();
        const links = []; const re = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
        while ((m = re.exec(html)) && links.length < 60) { const hr = decode(m[1]); if (/download|\.pdf|token|file/i.test(hr)) links.push([hr, clean(m[2]).slice(0, 80)]); }
        const forms = (html.match(/<form[\s\S]*?<\/form>/gi) || []).map(f => f.replace(/\s+/g, " ").slice(0, 1500));
        return json({ err: "το papline.gr έδωσε σελίδα αντί για αρχείο", status: r.status, url: r.url, ctype: ct, cookies: r.headers.get("set-cookie"), links, forms, text: clean(html).slice(0, 1200) });
      }
      const h = new Headers();
      h.set("content-type", "application/pdf");
      const len = r.headers.get("content-length"); if (len) h.set("content-length", len);
      h.set("cache-control", "public, max-age=86400");
      h.set("access-control-allow-origin", "*");
      return new Response(r.body, { status: 200, headers: h });
    }
    return json({ err: "χρήση: ?list= ή ?d=" });
  } catch (e) {
    return json({ err: "δεν απάντησε το papline.gr" });
  }
}
