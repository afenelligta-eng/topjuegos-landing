// Redirección de los links de anuncios: /gan/<clave>  ->  destino guardado en la PWA.
//
// Cambios respecto a la versión anterior:
//  - REENVÍA el query string del clic (fbclid, utm_*, etc.). Antes se descartaba y
//    la landing recibía siempre fbclid = "direct".
//  - Nunca deja al usuario en una pantalla de error: si Apps Script falla, tarda o
//    la clave no existe, redirige igual a la landing (FALLBACK_URL) con sus parámetros.
//  - Caché en memoria (60 s) + uso del último destino conocido si Apps Script cae.
//  - Timeout de 4 s a Apps Script (antes podía quedar colgado).

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzp4-jFTeQiJrCr4Sdy2BYFP1fGU3H-OHTvmdVYowUtsr40Noi-jzYhIVFbtsyFRURy/exec';
const FALLBACK_URL = process.env.FALLBACK_URL || '/';   // landing principal
const TTL_MS = 60 * 1000;
const TIMEOUT_MS = 4000;

const cache = new Map(); // clave -> { url, t }

function destinoValido(u) {
  if (typeof u !== 'string') return false;
  if (u.startsWith('//')) return false;                 // evita redirecciones "protocol-relative"
  return /^https?:\/\//i.test(u) || u.startsWith('/');
}

// Agrega al destino los parámetros del clic que el destino todavía no tenga.
function armarLocation(destino, params) {
  const base = new URL(destino, 'https://placeholder.invalid');
  for (const [k, v] of Object.entries(params)) {
    if (k === 'k' || v === undefined || v === null) continue;
    if (!base.searchParams.has(k)) base.searchParams.append(k, String(v));
  }
  return /^https?:\/\//i.test(destino) ? base.toString() : base.pathname + base.search + base.hash;
}

function parametrosDelClic(event) {
  const out = Object.assign({}, event.queryStringParameters || {});
  try { // refuerzo: toma también los parámetros de la URL original
    if (event.rawUrl) new URL(event.rawUrl).searchParams.forEach((v, k) => { if (!(k in out)) out[k] = v; });
  } catch (e) { /* ignorar */ }
  return out;
}

async function resolver(clave) {
  const hit = cache.get(clave);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.url;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=resolverRedirect&k=${encodeURIComponent(clave)}`, { signal: ctl.signal });
    const data = JSON.parse(await res.text());
    if (data && data.success && destinoValido(data.url)) {
      cache.set(clave, { url: data.url, t: Date.now() });
      return data.url;
    }
    cache.delete(clave);          // la clave no existe (o se borró)
    return null;
  } catch (e) {
    return hit ? hit.url : null;  // Apps Script caído/lento: último destino conocido
  } finally {
    clearTimeout(timer);
  }
}

function redirigir(location) {
  return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store' }, body: '' };
}

exports.handler = async (event) => {
  const params = parametrosDelClic(event);
  const fromPath = (event.path || '').split('/').filter(Boolean).pop() || '';
  const clave = String(params.k || fromPath).trim().toLowerCase();

  let destino = null;
  if (/^[a-z0-9_-]{1,40}$/.test(clave) && clave !== 'go') destino = await resolver(clave);
  return redirigir(armarLocation(destino || FALLBACK_URL, params));
};

exports._test = { armarLocation, destinoValido, cache };
