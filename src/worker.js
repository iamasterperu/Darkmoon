// Dark Moon Store: API del catálogo y del panel de administración.
// Datos en D1 (binding DB). Contraseña del admin en el secreto ADMIN_PASSWORD.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_IMAGE_BYTES = 1_500_000;
const TOKEN_DAYS = 14;
const SETTING_KEYS = ["store_name", "whatsapp", "promo_on", "promo_label", "promo_title", "promo_highlight", "promo_image", "promo_product", "promo_end"];
const PRODUCT_FIELDS = ["name", "cat", "gen", "price", "desc", "img", "sizes", "colors", "active", "sort", "flag"];

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const err = (message, status = 400) => json({ error: message }, status);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (!env.DB) return err("Falta conectar la base de datos (binding DB).", 500);
      await ensureSchema(env, url.origin);

      if (path === "/api/catalog" && request.method === "GET") return catalog(env, false);
      if (path === "/api/login" && request.method === "POST") return login(request, env);
      if (path.startsWith("/img/u/") && request.method === "GET") return serveImage(env, path.slice(7));

      if (path.startsWith("/api/admin/")) {
        if (!(await authorized(request, env))) return err("Tu sesión venció. Vuelve a entrar.", 401);
        const rest = path.slice("/api/admin/".length);
        if (rest === "catalog" && request.method === "GET") return catalog(env, true);
        if (rest === "products" && request.method === "POST") return saveProduct(request, env, null);
        if (rest.startsWith("products/")) {
          const id = decodeURIComponent(rest.slice(9));
          if (request.method === "PUT") return saveProduct(request, env, id);
          if (request.method === "DELETE") return deleteProduct(env, id);
        }
        if (rest === "order" && request.method === "PUT") return saveOrder(request, env);
        if (rest === "settings" && request.method === "PUT") return saveSettings(request, env);
        if (rest === "upload" && request.method === "POST") return upload(request, env, url.origin);
      }
      if (path.startsWith("/api/")) return err("Ruta no encontrada.", 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      return err("Error del servidor: " + (e && e.message ? e.message : "desconocido"), 500);
    }
  },
};

/* ---------- esquema y datos iniciales ---------- */
let schemaReady = false;
async function ensureSchema(env, origin) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL DEFAULT 'polos', gen TEXT NOT NULL DEFAULT 'H',
      price REAL NOT NULL DEFAULT 0, "desc" TEXT NOT NULL DEFAULT '', img TEXT NOT NULL DEFAULT '',
      sizes TEXT NOT NULL DEFAULT 'S,M,L,XL', colors TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
      flag TEXT NOT NULL DEFAULT '', updated_at TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT)`),
  ]);
  const cols = (await env.DB.prepare("PRAGMA table_info(products)").all()).results.map((c) => c.name);
  if (!cols.includes("colors")) {
    await env.DB.prepare("ALTER TABLE products ADD COLUMN colors TEXT NOT NULL DEFAULT ''").run();
    const seed = await (await env.ASSETS.fetch(new Request(origin + "/catalog.json"))).json();
    await env.DB.batch(seed.products.filter((p) => p.colors).map((p) =>
      env.DB.prepare("UPDATE products SET colors=? WHERE id=? AND colors=''").bind(p.colors, p.id)));
  }
  const seeded = await env.DB.prepare("SELECT value FROM settings WHERE key='seeded'").first();
  if (!seeded) {
    const res = await env.ASSETS.fetch(new Request(origin + "/catalog.json"));
    const seed = await res.json();
    const stmts = seed.products.map((p) =>
      env.DB.prepare(`INSERT OR IGNORE INTO products (id,name,cat,gen,price,"desc",img,sizes,colors,active,sort,flag,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(p.id, p.name, p.cat, p.gen, p.price, p.desc, p.img, p.sizes, p.colors || "", p.active, p.sort, p.flag || "")
    );
    for (const [k, v] of Object.entries(seed.settings)) {
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind(k, String(v)));
    }
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded','1')"));
    await env.DB.batch(stmts);
  }
  schemaReady = true;
}

async function catalog(env, all) {
  const q = all
    ? "SELECT * FROM products ORDER BY sort, name"
    : "SELECT * FROM products WHERE active=1 ORDER BY sort, name";
  const { results } = await env.DB.prepare(q).all();
  const { results: rows } = await env.DB.prepare("SELECT key,value FROM settings").all();
  const settings = {};
  for (const r of rows) if (SETTING_KEYS.includes(r.key)) settings[r.key] = r.value;
  return json({ settings, products: results });
}

/* ---------- autenticación ---------- */
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return err("Falta configurar la contraseña del panel (ADMIN_PASSWORD).", 500);
  const body = await request.json().catch(() => ({}));
  const given = String(body.password || "");
  const ok = sameText(await hmac("pw", given), await hmac("pw", env.ADMIN_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800));
    return err("Contraseña incorrecta.", 401);
  }
  const exp = Date.now() + TOKEN_DAYS * 86400000;
  const token = exp + "." + (await hmac(env.ADMIN_PASSWORD, "dm:" + exp));
  return json({ token, exp });
}
async function authorized(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sameText(sig, await hmac(env.ADMIN_PASSWORD, "dm:" + exp));
}

/* ---------- productos ---------- */
function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "producto";
}
function cleanProduct(b) {
  const p = {};
  for (const f of PRODUCT_FIELDS) if (b[f] !== undefined) p[f] = b[f];
  if (p.name !== undefined) { p.name = String(p.name).trim().slice(0, 120); if (!p.name) throw new Error("El nombre no puede quedar vacío."); }
  if (p.price !== undefined) { p.price = Math.round(Number(p.price) * 100) / 100; if (!(p.price >= 0) || p.price > 100000) throw new Error("Revisa el precio."); }
  if (p.cat !== undefined) p.cat = slug(p.cat).slice(0, 30) || "otros";
  if (p.gen !== undefined) p.gen = ["H", "M", "U"].includes(p.gen) ? p.gen : "U";
  if (p.desc !== undefined) p.desc = String(p.desc).slice(0, 600);
  if (p.img !== undefined) { p.img = String(p.img).slice(0, 300); if (p.img && !/^\/img\//.test(p.img)) throw new Error("Imagen no válida."); }
  if (p.sizes !== undefined) p.sizes = String(p.sizes).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15).join(",");
  if (p.colors !== undefined) {
    p.colors = String(p.colors).split(",").map((c) => {
      const i = c.lastIndexOf(":");
      const name = c.slice(0, i).replace(/[:,<>"]/g, "").trim().slice(0, 24);
      const hex = c.slice(i + 1).trim();
      return i > 0 && name && /^#[0-9a-fA-F]{6}$/.test(hex) ? name + ":" + hex.toLowerCase() : "";
    }).filter(Boolean).slice(0, 12).join(",");
  }
  if (p.active !== undefined) p.active = p.active ? 1 : 0;
  if (p.sort !== undefined) p.sort = Math.trunc(Number(p.sort) || 0);
  if (p.flag !== undefined) p.flag = String(p.flag).slice(0, 20);
  return p;
}
async function saveProduct(request, env, id) {
  let p;
  try { p = cleanProduct(await request.json()); } catch (e) { return err(e.message || "Datos no válidos."); }
  if (id === null) {
    if (!p.name) return err("Escribe el nombre del producto.");
    let base = slug(p.name), newId = base, n = 2;
    while (await env.DB.prepare("SELECT 1 FROM products WHERE id=?").bind(newId).first()) newId = base + "-" + n++;
    const max = await env.DB.prepare("SELECT COALESCE(MIN(sort),0) AS m FROM products").first();
    const row = { cat: "polos", gen: "H", price: 0, desc: "", img: "", sizes: "S,M,L,XL", colors: "", active: 1, sort: (max.m || 0) - 1, flag: "", ...p };
    await env.DB.prepare(`INSERT INTO products (id,name,cat,gen,price,"desc",img,sizes,colors,active,sort,flag,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(newId, row.name, row.cat, row.gen, row.price, row.desc, row.img, row.sizes, row.colors, row.active, row.sort, row.flag).run();
    return json(await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(newId).first(), 201);
  }
  const keys = Object.keys(p);
  if (!keys.length) return err("No hay cambios.");
  const sets = keys.map((k) => `"${k}"=?`).join(",");
  const r = await env.DB.prepare(`UPDATE products SET ${sets}, updated_at=datetime('now') WHERE id=?`).bind(...keys.map((k) => p[k]), id).run();
  if (!r.meta.changes) return err("Ese producto ya no existe.", 404);
  return json(await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first());
}
async function deleteProduct(env, id) {
  const r = await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
  if (!r.meta.changes) return err("Ese producto ya no existe.", 404);
  return json({ ok: true });
}
async function saveOrder(request, env) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 1000) : [];
  await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE products SET sort=? WHERE id=?").bind(i, String(id))));
  return json({ ok: true });
}
async function saveSettings(request, env) {
  const body = await request.json().catch(() => ({}));
  const stmts = [];
  for (const k of SETTING_KEYS) {
    if (body[k] === undefined) continue;
    let v = String(body[k]).slice(0, 300);
    if (k === "whatsapp") { v = v.replace(/\D/g, ""); if (v.length < 9) return err("Revisa el número de WhatsApp (con 51 adelante)."); }
    if (k === "promo_image" && v && !/^\/img\//.test(v)) return err("Imagen de la promo no válida.");
    stmts.push(env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, v));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return catalog(env, true);
}

/* ---------- imágenes ---------- */
async function upload(request, env) {
  const mime = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/webp", "image/jpeg", "image/png"].includes(mime)) return err("Sube una foto JPG, PNG o WEBP.");
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return err("La foto llegó vacía.");
  if (buf.byteLength > MAX_IMAGE_BYTES) return err("La foto es muy pesada. Prueba con otra.");
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO images (id,mime,data,created_at) VALUES (?,?,?,datetime('now'))").bind(id, mime, buf).run();
  return json({ url: "/img/u/" + id });
}
async function serveImage(env, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response("No encontrada", { status: 404 });
  const row = await env.DB.prepare("SELECT mime,data FROM images WHERE id=?").bind(id).first();
  if (!row) return new Response("No encontrada", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" },
  });
}
