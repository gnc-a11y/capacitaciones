import { SCRIPT_URL } from './state.js';

export async function callGAS(payload, callback) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      callback(data);
      return;
    }
  } catch (e) {
    console.warn("POST falló, intentando fallback JSONP...", e);
  }

  if (payload.action === 'subirComprobante') {
    callback({ success: false, message: "No se pudo conectar para subir el archivo. Verificá tu conexión." });
    return;
  }

  const query = Object.keys(payload)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]))
    .join('&');
  const callbackName = 'gas_cb_' + Math.floor(Math.random() * 1000000);
  const script = document.createElement('script');
  let timeoutId;

  window[callbackName] = function(data) {
    clearTimeout(timeoutId);
    delete window[callbackName];
    if (script.parentNode) script.parentNode.removeChild(script);
    callback(data);
  };

  timeoutId = setTimeout(() => {
    delete window[callbackName];
    if (script.parentNode) script.parentNode.removeChild(script);
    callback({ success: false, message: "Tiempo de espera agotado." });
  }, 30000);

  script.src = SCRIPT_URL + '?' + query + '&callback=' + callbackName;
  document.body.appendChild(script);
}
