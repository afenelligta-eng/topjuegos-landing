// Resuelve /gan/<clave> contra el mapa guardado en Apps Script y manda un 302
// REAL directo al destino final. El navegador nunca ve script.google.com: esta
// función corre en el servidor de Netlify y hace el fetch ella misma.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzp4-jFTeQiJrCr4Sdy2BYFP1fGU3H-OHTvmdVYowUtsr40Noi-jzYhIVFbtsyFRURy/exec';

exports.handler = async (event) => {
  const key = ((event.queryStringParameters && event.queryStringParameters.k) || '').trim().toLowerCase();

  if (!key) {
    return { statusCode: 404, body: 'Link no encontrado.' };
  }

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=resolverRedirect&k=${encodeURIComponent(key)}`);
    const data = await res.json();

    if (data && data.success && data.url) {
      return { statusCode: 302, headers: { Location: data.url } };
    }
  } catch (err) {
    // cae al 404 de abajo
  }

  return { statusCode: 404, body: 'Link no encontrado.' };
};
