const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzp4-jFTeQiJrCr4Sdy2BYFP1fGU3H-OHTvmdVYowUtsr40Noi-jzYhIVFbtsyFRURy/exec';

exports.handler = async (event) => {
  const fromQuery = (event.queryStringParameters && event.queryStringParameters.k) || '';
  const fromPath = (event.path || '').split('/').filter(Boolean).pop() || '';
  const key = (fromQuery || fromPath).trim().toLowerCase();

  if (!key || key === 'go') {
    return { statusCode: 404, body: 'Falta la clave del link.' };
  }

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=resolverRedirect&k=${encodeURIComponent(key)}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { statusCode: 502, body: 'Apps Script no devolvio JSON. Status ' + res.status + ': ' + text.slice(0, 200) };
    }

    if (data && data.success && data.url) {
      return { statusCode: 302, headers: { Location: data.url } };
    }
    return { statusCode: 404, body: 'Link no encontrado: ' + key };
  } catch (err) {
    return { statusCode: 500, body: 'Error en la funcion: ' + err.toString() };
  }
};
