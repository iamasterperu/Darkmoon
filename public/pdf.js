/* Generador de catálogo en PDF. Corre en el navegador de quien lo descarga, con los datos actuales de la tienda.
   No usa servicios externos ni inteligencia artificial: es código que arma el archivo en el momento. */
(function () {
  const W = 595, H = 842;
  const HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const BASE = (c) => {
    const m = "àáâãäåÀÁÂÃÄÅ|aaaaaaAAAAAA;èéêëÈÉÊË|eeeeEEEE;ìíîïÌÍÎÏ|iiiiIIII;òóôõöÒÓÔÕÖ|ooooOOOOO;ùúûüÙÚÛÜ|uuuuUUUU;ñÑ|nN;¿|?;¡|!;·|-;“”|\"\"".split(";");
    for (const e of m) { const [a, b] = e.split("|"); const i = a.indexOf(c); if (i >= 0) return b[i]; }
    return c;
  };
  const clean = (s) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").split("").map((c) => (c.charCodeAt(0) < 256 ? c : /[–—]/.test(c) ? "-" : /[‘’]/.test(c) ? "'" : "")).join("");
  const width = (s, size, bold) => {
    const t = bold ? HB : HV; let w = 0;
    for (const ch of s) { const b = BASE(ch).charCodeAt(0); w += b >= 32 && b <= 126 ? t[b - 32] : 556; }
    return (w * size) / 1000;
  };
  const esc = (s) => s.replace(/[\\()]/g, (m) => "\\" + m);
  const rgb = (hex) => { const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"; return [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" "); };
  const n = (v) => (Math.round(v * 100) / 100).toString();

  function wrap(text, size, bold, maxW, maxLines) {
    const words = clean(text).split(" ").filter(Boolean), lines = []; let cur = "";
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + " " + words[i] : words[i];
      if (width(t, size, bold) <= maxW) cur = t;
      else { if (cur) lines.push(cur); cur = words[i]; }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && cur) lines.push(cur);
    const used = lines.join(" ").split(" ").length;
    if (used < words.length || lines.length > maxLines) {
      lines.length = Math.min(lines.length, maxLines);
      let last = lines[lines.length - 1] || "";
      while (last && width(last + "...", size, bold) > maxW) last = last.slice(0, -1);
      lines[lines.length - 1] = last.trimEnd() + "...";
    }
    return lines;
  }

  class Page {
    constructor() { this.ops = []; this.links = []; this.imgs = new Set(); }
    rect(x, y, w, h, hex) { this.ops.push(`${rgb(hex)} rg ${n(x)} ${n(H - y - h)} ${n(w)} ${n(h)} re f`); }
    text(s, x, y, size, o = {}) {
      s = clean(s); const w = width(s, size, o.bold);
      if (o.align === "center") x -= w / 2; else if (o.align === "right") x -= w;
      this.ops.push(`BT /${o.bold ? "F2" : "F1"} ${n(size)} Tf ${rgb(o.color || "#0c0c0e")} rg ${n(x)} ${n(H - y)} Td (${esc(s)}) Tj ET`);
      return w;
    }
    circle(cx, cy, r, fill, stroke) {
      const k = 0.5523 * r, X = cx, Y = H - cy;
      this.ops.push(`${rgb(fill)} rg ${rgb(stroke || "#bdbdbd")} RG 0.6 w ${n(X + r)} ${n(Y)} m ` +
        `${n(X + r)} ${n(Y + k)} ${n(X + k)} ${n(Y + r)} ${n(X)} ${n(Y + r)} c ${n(X - k)} ${n(Y + r)} ${n(X - r)} ${n(Y + k)} ${n(X - r)} ${n(Y)} c ` +
        `${n(X - r)} ${n(Y - k)} ${n(X - k)} ${n(Y - r)} ${n(X)} ${n(Y - r)} c ${n(X + k)} ${n(Y - r)} ${n(X + r)} ${n(Y - k)} ${n(X + r)} ${n(Y)} c B`);
    }
    image(id, x, y, w, h) { this.imgs.add(id); this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(H - y - h)} cm /Im${id} Do Q`); }
    link(x, y, w, h, uri) { this.links.push({ r: [x, H - y - h, x + w, H - y], uri: clean(uri) }); }
  }

  function build(pages, images, title) {
    const parts = []; let size = 0; const offs = [];
    const put = (s) => { const b = typeof s === "string" ? Uint8Array.from(s, (c) => c.charCodeAt(0) & 255) : s; parts.push(b); size += b.length; };
    const obj = (id, body) => { offs[id] = size; put(id + " 0 obj\n" + body + "\nendobj\n"); };
    put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const imgBase = 5, resId = imgBase + images.length, pageBase = resId + 1;
    const pageIds = pages.map((_, i) => pageBase + i * 2 + 1);
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${pageIds.map((i) => i + " 0 R").join(" ")}] /Count ${pages.length} >>`);
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    images.forEach((im, i) => {
      offs[imgBase + i] = size;
      put(`${imgBase + i} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
      put(im.bytes); put("\nendstream\nendobj\n");
    });
    obj(resId, `<< /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${images.map((_, i) => `/Im${i} ${imgBase + i} 0 R`).join(" ")} >> >>`);
    pages.forEach((p, i) => {
      const cid = pageBase + i * 2, pid = cid + 1, data = p.ops.join("\n");
      obj(cid, `<< /Length ${data.length} >>\nstream\n${data}\nendstream`);
      const annots = p.links.length ? ` /Annots [${p.links.map((l) => `<< /Type /Annot /Subtype /Link /Rect [${l.r.map(n).join(" ")}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.uri)}) >> >>`).join(" ")}]` : "";
      obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${resId} 0 R /Contents ${cid} 0 R${annots} >>`);
    });
    const infoId = pageBase + pages.length * 2;
    obj(infoId, `<< /Title (${esc(clean(title))}) /Producer (Catalogo) >>`);
    const xref = size, total = infoId + 1;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    put(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: "application/pdf" });
  }

  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("img " + src)); i.src = src; });
  async function jpeg(img, px, bg, fit) {
    const c = document.createElement("canvas"); const ar = img.naturalWidth / img.naturalHeight;
    c.width = fit === "contain" ? px : px; c.height = fit === "contain" ? Math.round(px / ar) : px;
    const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    if (fit === "contain") g.drawImage(img, 0, 0, c.width, c.height);
    else { const s = Math.min(img.naturalWidth, img.naturalHeight); g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, px, px); }
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  }

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const INK = "#0c0c0e", MUTED = "#6f737d", MOON = "#d6ff3e";

  // opts: { products, categories:[[key,label]], storeName, whatsapp, url, logoSrc }
  window.buildCatalogPdf = async function (opts) {
    const store = clean(opts.storeName || "Catalogo"), wa = String(opts.whatsapp || "").replace(/\D/g, "");
    const waShow = wa.length > 3 ? "+" + wa.slice(0, 2) + " " + wa.slice(2, 5) + " " + wa.slice(5, 8) + " " + wa.slice(8) : wa;
    const images = [], idx = new Map();
    const add = async (key, make) => { if (idx.has(key)) return idx.get(key); try { images.push(await make()); idx.set(key, images.length - 1); } catch (e) { idx.set(key, -1); } return idx.get(key); };
    const logoI = await add("logo", async () => jpeg(await load(opts.logoSrc), 700, INK, "contain"));
    const logoRatio = logoI >= 0 ? images[logoI].w / images[logoI].h : 3;
    const pages = [];
    const now = new Date();

    // portada
    const cv = new Page(); pages.push(cv);
    cv.rect(0, 0, W, H, INK);
    cv.rect(0, 0, W, 8, MOON);
    if (logoI >= 0) cv.image(logoI, W / 2 - 190, 250, 380, 380 / logoRatio);
    cv.text("CATALOGO " + now.getFullYear(), W / 2, 250 + 380 / logoRatio + 60, 22, { bold: true, align: "center", color: "#ffffff" });
    cv.text(MESES[now.getMonth()].charAt(0).toUpperCase() + MESES[now.getMonth()].slice(1) + " " + now.getFullYear(), W / 2, 250 + 380 / logoRatio + 84, 12, { align: "center", color: "#a6a8b0" });
    cv.rect(W / 2 - 24, 250 + 380 / logoRatio + 104, 48, 3, MOON);
    cv.text("Pedidos por WhatsApp " + waShow, W / 2, H - 70, 13, { bold: true, align: "center", color: "#ffffff" });
    if (opts.url) cv.text(opts.url.replace(/^https?:\/\//, "").replace(/\/$/, ""), W / 2, H - 50, 10, { align: "center", color: "#a6a8b0" });
    if (wa) cv.link(W / 2 - 150, H - 84, 300, 20, "https://wa.me/" + wa);

    // productos por categoría
    const M = 36, COLS = 3, GAP = 14, CW = (W - 2 * M - GAP * (COLS - 1)) / COLS, IMGH = CW, CARDH = 233, ROWGAP = 12, TOP = 66, ROWS = 3;
    let pageNo = 1;
    for (const [key, label] of opts.categories) {
      const list = opts.products.filter((p) => p.cat === key);
      for (let s = 0; s < list.length; s += COLS * ROWS) {
        const pg = new Page(); pages.push(pg); pageNo++;
        pg.rect(0, 0, W, 44, INK);
        if (logoI >= 0) pg.image(logoI, M, 9, 26 * logoRatio, 26);
        pg.text(label.toUpperCase(), W - M, 29, 12, { bold: true, align: "right", color: "#ffffff" });
        pg.rect(0, 44, W, 3, MOON);
        const slice = list.slice(s, s + COLS * ROWS);
        for (let i = 0; i < slice.length; i++) {
          const p = slice[i], col = i % COLS, row = Math.floor(i / COLS);
          const x = M + col * (CW + GAP), y = TOP + row * (CARDH + ROWGAP);
          const ii = await add("p:" + p.img, async () => jpeg(await load(p.img), 460, "#ffffff", "cover"));
          if (ii >= 0) pg.image(ii, x, y, CW, IMGH); else pg.rect(x, y, CW, IMGH, "#e8eaee");
          const lines = wrap(p.name, 9.5, true, CW, 2);
          lines.forEach((l, k) => pg.text(l, x, y + IMGH + 15 + k * 11, 9.5, { bold: true }));
          pg.text("S/ " + Number(p.price).toFixed(2), x, y + IMGH + 15 + 22 + 6, 13, { bold: true });
          const cs = (p.colors || "").split(",").map((c) => { const j = c.lastIndexOf(":"); return j > 0 ? c.slice(j + 1) : null; }).filter(Boolean).slice(0, 8);
          cs.forEach((h, k) => pg.circle(x + 5 + k * 15, y + IMGH + 15 + 22 + 6 + 15, 5, h));
          const sz = String(p.sizes || "").split(",").map((t) => t.trim()).filter(Boolean).join(" - ");
          if (sz) pg.text("Tallas: " + sz, x, y + IMGH + 15 + 22 + 6 + (cs.length ? 32 : 18), 8, { color: MUTED });
        }
        pg.text(store + "  |  WhatsApp " + waShow, M, H - 22, 8, { color: MUTED });
        if (wa) pg.link(M, H - 32, 260, 14, "https://wa.me/" + wa);
        pg.text(String(pageNo), W - M, H - 22, 8, { color: MUTED, align: "right" });
        if (opts.credit) { pg.text("Catalogo creado por " + opts.credit.name, W / 2, H - 22, 7.5, { color: "#9498a3", align: "center" }); pg.link(W / 2 - 80, H - 32, 160, 14, opts.credit.url); }
      }
    }
    if (opts.credit) {
      const ep = new Page(); pages.push(ep);
      ep.rect(0, 0, W, H, INK); ep.rect(0, 0, W, 8, MOON);
      ep.text("Quieres un catalogo asi", W / 2, 370, 26, { bold: true, align: "center", color: "#ffffff" });
      ep.text("para tu negocio?", W / 2, 402, 26, { bold: true, align: "center", color: "#ffffff" });
      ep.text("Catalogo virtual con panel propio y PDF automatico.", W / 2, 436, 11, { align: "center", color: "#a6a8b0" });
      ep.rect(W / 2 - 110, 468, 220, 40, MOON);
      ep.text("Escribeme por WhatsApp", W / 2, 493, 12, { bold: true, align: "center", color: INK });
      ep.link(W / 2 - 110, 468, 220, 40, opts.credit.url);
      ep.text("Creado por " + opts.credit.name, W / 2, H - 50, 10, { align: "center", color: "#a6a8b0" });
    }
    return build(pages, images, store + " - Catalogo");
  };
})();
