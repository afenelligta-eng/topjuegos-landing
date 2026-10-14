// Configuración pública de la landing: Pixel ID + número de WhatsApp vigentes.
//
// Fuente de verdad: las "Propiedades del script" del Apps Script (lo que guardás desde la PWA).
// Esta función es solo un intermediario RÁPIDO: el CDN de Netlify guarda la respuesta unos
// segundos, así los visitantes casi nunca esperan el arranque en frío de Apps Script.
//
//  - Un cambio hecho en la PWA llega a la landing en menos de ~1 minuto.
//  - Si Apps Script falla, devuelve el último valor bueno que esta instancia conoció.
//  - Si el Apps Script todavía no tiene la acción "getConfig" (versión vieja), arma la
//    respuesta con getPixel + getWhatsapp, así se puede desplegar en cualquier orden.
//  - Nunca expone secretos: solo el Pixel ID (ya visible en la página) y el número del botón.

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzp4-jFTeQiJrCr4Sdy2BYFP1fGU3H-OHTvmdVYowUtsr40Noi-jzYhIVFbtsyFRURy/exec';
const TIMEOUT_MS = 6000;               // Netlify corta las funciones a los 10 s
const PIXEL_RE = /^\d{10,20}$/;
const WA_RE = /^549\d{10}$/;

let ultimoBueno = null;                // { pixelId, numero, t } — memoria de esta instancia

async function pedir(accion) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=${accion}`, { signal: ctl.signal });
    return JSON.parse(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

function limpiar(d) {
  const out = {};
  if (d && PIXEL_RE.test(String(d.pixelId))) out.pixelId = String(d.pixelId);
  if (d && WA_RE.test(String(d.numero))) out.numero = String(d.numero);
  return out;
}

async function leerConfig() {
  let cfg = {};
  try { cfg = limpiar(await pedir('getConfig')); } catch (e) { /* se prueba el camino viejo */ }
  if (cfg.pixelId && cfg.numero) return cfg;

  // Respaldo: Apps Script sin "getConfig" (o que devolvió algo incompleto).
  const [p, w] = await Promise.all([
    pedir('getPixel').catch(() => null),
    pedir('getWhatsapp').catch(() => null)
  ]);
  const viejo = limpiar({ pixelId: p && p.pixelId, numero: w && w.numero });
  return Object.assign({}, cfg, viejo);
}

function responder(status, body, cache) {
  const h = { 'Content-Type': 'application/json; charset=utf-8' };
  if (cache) {
    h['Cache-Control'] = 'public, max-age=0, must-revalidate';                                  // el navegador siempre pregunta
    h['Netlify-CDN-Cache-Control'] = 'public, s-maxage=20, stale-while-revalidate=40';          // el CDN guarda 20 s
  } else {
    h['Cache-Control'] = 'no-store';
  }
  return { statusCode: status, headers: h, body: JSON.stringify(body) };
}

exports.handler = async () => {
  try {
    const cfg = await leerConfig();
    if (cfg.pixelId || cfg.numero) {
      ultimoBueno = Object.assign({}, ultimoBueno || {}, cfg, { t: Date.now() });
      return responder(200, Object.assign({ success: true }, cfg), true);
    }
  } catch (e) { /* cae al último valor bueno */ }

  if (ultimoBueno) {
    const { pixelId, numero } = ultimoBueno;
    return responder(200, { success: true, stale: true, pixelId, numero }, false);   // sin caché de CDN: se reintenta enseguida
  }
  return responder(502, { success: false, message: 'config-no-disponible' }, false);
};

exports._test = { limpiar, leerConfig, reset: () => { ultimoBueno = null; } };
