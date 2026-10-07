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
const TTL_MS = 5 * 60 * 1000;   // un cambio hecho en la PWA tarda hasta 5 min en reflejarse (a cambio, casi nadie espera a Apps Script)
const TIMEOUT_MS = 8000;   // Apps Script puede tardar varios segundos en "arrancar en frío"

// Respaldo fijo: si Apps Script tarda o falla y no hay nada en memoria, se usa este destino
// en lugar de mandar la gente a la landing. Agregá acá tus links importantes: clave: 'URL'.
const RESPALDO = {
  gan1: 'https://ganamosbet.net/',
};

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

// Devuelve { url, motivo }. "motivo" explica por qué no hubo destino (se ve en el header x-go-motivo).
async function resolver(clave) {
  const hit = cache.get(clave);
  if (hit && Date.now() - hit.t < TTL_MS) return { url: hit.url, motivo: 'cache' };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let motivo = 'error';
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=resolverRedirect&k=${encodeURIComponent(clave)}`, { signal: ctl.signal });
    const texto = await res.text();
    let data = null;
    try { data = JSON.parse(texto); } catch (e) { motivo = 'apps-script-no-json-' + res.status; }
    if (data) {
      if (data.success && destinoValido(data.url)) {
        cache.set(clave, { url: data.url, t: Date.now() });
        return { url: data.url, motivo: 'ok' };
      }
      cache.delete(clave);          // la clave no existe (o se borró)
      return { url: null, motivo: 'clave-inexistente' };
    }
  } catch (e) {
    motivo = e && e.name === 'AbortError' ? 'timeout' : 'red-' + String(e && e.message).slice(0, 40);
  } finally {
    clearTimeout(timer);
  }
  // Apps Script caído/lento: último destino conocido, si lo hay
  if (hit) return { url: hit.url, motivo: motivo + '-usando-ultimo-conocido' };
  if (RESPALDO[clave] && destinoValido(RESPALDO[clave])) return { url: RESPALDO[clave], motivo: motivo + '-usando-respaldo-fijo' };
  return { url: null, motivo };
}

function redirigir(location, motivo) {
  return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'x-go-motivo': motivo || '' }, body: '' };
}

exports.handler = async (event) => {
  const params = parametrosDelClic(event);
  const fromPath = (event.path || '').split('/').filter(Boolean).pop() || '';
  const clave = String(params.k || fromPath).trim().toLowerCase();

  let r = { url: null, motivo: 'clave-invalida' };
  if (/^[a-z0-9_-]{1,40}$/.test(clave) && clave !== 'go') r = await resolver(clave);
  return redirigir(armarLocation(r.url || FALLBACK_URL, params), r.url ? r.motivo : 'FALLBACK-' + r.motivo);
};

exports._test = { armarLocation, destinoValido, cache };
