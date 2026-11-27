import { state } from './state.js';
import { callGAS } from './api.js';
import { escapeHtml, safeExternalUrl } from './ui.js';

export function renderCapacitaciones(lista) {
  const cont = document.getElementById('listaCapacitaciones');
  cont.innerHTML = '';
  lista.forEach(cap => {
    let badgeEstado = '';
    let botonExamen = '';
    if (cap.aprobado) {
      badgeEstado = `<span class="badge badge-status badge-aprobado">✓ Aprobado</span>`;
      botonExamen = `<button class="btn btn-outline-primary w-100 mb-2 btn-rendir-cap" data-titulo="${escapeHtml(cap.titulo)}">Rendir Nuevamente</button>`;
      const certificadoUrl = safeExternalUrl(cap.urlCertificado);
      if (certificadoUrl) {
        botonExamen += `<a href="${escapeHtml(certificadoUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-success w-100 fw-bold">📄 Ver / Descargar Certificado</a>`;
      } else {
        botonExamen += `<div class="small text-warning mt-2">${escapeHtml(cap.mensajeCertificado || 'Certificado PDF no disponible; volvé a cargar los cursos para reintentar.')}</div>`;
      }
    } else if (cap.bloqueado) {
      badgeEstado = `<span class="badge badge-status badge-bloqueado">Límite de 3 intentos alcanzado hoy</span>`;
      botonExamen = `<button class="btn btn-secondary w-100" disabled>Bloqueado por hoy</button>`;
    } else {
      badgeEstado = `<span class="badge badge-status badge-intentos">Intentos hoy: ${escapeHtml(cap.intentosHoy)}/3</span>`;
      botonExamen = `<button class="btn btn-primary w-100 btn-rendir-cap" data-titulo="${escapeHtml(cap.titulo)}">Rendir Examen</button>`;
    }

    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-5';
    col.innerHTML = `
      <div class="card card-custom h-100 p-4 d-flex flex-column justify-content-between">
        <div>
          <h5 class="fw-bold text-dark mb-2">${escapeHtml(cap.titulo)}</h5>
          <p class="text-muted small mb-3">${escapeHtml(cap.descripcion)}</p>
          <div class="mb-3">${badgeEstado}</div>
        </div>
        <div>
          <button class="btn btn-outline-secondary w-100 mb-2 btn-ver-material" data-titulo="${escapeHtml(cap.titulo)}" data-url="${escapeHtml(safeExternalUrl(cap.urlDrive) || '')}" ${safeExternalUrl(cap.urlDrive) ? '' : 'disabled'}>Ver Material (PDF)</button>
          ${botonExamen}
        </div>
      </div>`;
    cont.appendChild(col);
  });

  cont.querySelectorAll('.btn-ver-material').forEach(btn => {
    btn.addEventListener('click', () => verContenido(btn.dataset.titulo, btn.dataset.url));
  });
  cont.querySelectorAll('.btn-rendir-cap').forEach(btn => {
    btn.addEventListener('click', () => iniciarExamen(btn.dataset.titulo));
  });
}

function verContenido(titulo, url) {
  document.getElementById('tituloContenido').innerText = titulo;
  const safeUrl = safeExternalUrl(url);
  const link = document.getElementById('btnLinkDrive');
  link.href = safeUrl || '#';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-disabled', safeUrl ? 'false' : 'true');
  link.hidden = !safeUrl;
  new window.bootstrap.Modal(document.getElementById('modalContenido')).show();
}

function iniciarExamen(titulo) {
  state.capacitacionActual = titulo;
  state.intentoExamen = "";
  document.getElementById('tituloExamen').innerText = "Evaluación: " + titulo;
  document.getElementById('cuerpoExamen').innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Generando examen...</p></div>`;
  document.getElementById('footerExamen').classList.remove('d-none');
  new window.bootstrap.Modal(document.getElementById('modalExamen')).show();

  callGAS({
    action: 'generarExamen',
    usuario: state.usuarioActual.usuario,
    titulo: titulo
  }, function(res) {
    if (res && res.success) {
      state.intentoExamen = res.intentoId;
      state.preguntasActuales = res.preguntas;
      renderPreguntas(res.preguntas);
    } else {
      document.getElementById('cuerpoExamen').innerHTML = `<div class="alert alert-danger">${escapeHtml(res ? res.message : 'Error al cargar preguntas.')}</div>`;
      document.getElementById('footerExamen').classList.add('d-none');
    }
  });
}

function renderPreguntas(preguntas) {
  let html = '';
  preguntas.forEach((p, idx) => {
    html += `<div class="mb-4 p-3 border rounded bg-light"><p class="fw-bold mb-2">${idx + 1}. ${escapeHtml(p.enunciado)}</p>`;
    Object.keys(p.opciones).forEach(key => {
      const isMultiple = p.multiple;
      const inputType = isMultiple ? 'checkbox' : 'radio';
      const inputName = isMultiple ? `p_${idx}_${key}` : `p_${idx}`;
      html += `
        <div class="form-check my-1">
          <input class="form-check-input" type="${inputType}" name="${escapeHtml(inputName)}" value="${escapeHtml(key)}" id="p_${idx}_${escapeHtml(key)}">
          <label class="form-check-label" for="p_${idx}_${escapeHtml(key)}">${escapeHtml(p.opciones[key])}</label>
        </div>`;
    });
    html += `</div>`;
  });
  document.getElementById('cuerpoExamen').innerHTML = html;
}

export function initCapacitacionesEvents() {
  document.getElementById('btnEnviarExamen').addEventListener('click', evaluarExamen);
}

function evaluarExamen() {
  if (!state.intentoExamen || !state.preguntasActuales.length) {
    document.getElementById('cuerpoExamen').innerHTML = '<div class="alert alert-danger">No se encontró el intento activo. Cerrá y volvé a iniciar la evaluación.</div>';
    return;
  }

  const respuestas = {};
  state.preguntasActuales.forEach((p, idx) => {
    const seleccionadas = [];
    if (p.multiple) {
      Object.keys(p.opciones).forEach(key => {
        const input = document.getElementById(`p_${idx}_${key}`);
        if (input && input.checked) seleccionadas.push(key);
      });
    } else {
      const checked = document.querySelector(`input[name="p_${idx}"]:checked`);
      if (checked) seleccionadas.push(checked.value);
    }
    respuestas[p.id] = seleccionadas;
  });

  document.getElementById('cuerpoExamen').innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Procesando resultado...</p></div>`;
  document.getElementById('footerExamen').classList.add('d-none');

  callGAS({
    action: 'guardarResultado',
    usuario: state.usuarioActual.usuario,
    intentoId: state.intentoExamen,
    respuestas: JSON.stringify(respuestas)
  }, function(res) {
    if (res && res.success) {
      const aprobado = res.estado === "Aprobado";
      const nota = res.nota;
      state.intentoExamen = "";
      let htmlRes = `
        <div class="alert ${aprobado ? "alert-success" : "alert-danger"} text-center p-4">
          <h4>${aprobado ? "¡Felicitaciones! Has Aprobado" : "Evaluación Desaprobada"}</h4>
          <p class="fs-5 my-2">Tu nota fue: <strong>${nota}%</strong> (Mínimo: 60%)</p>`;
      const certificadoUrl = safeExternalUrl(res.urlCertificado);
      if (aprobado && certificadoUrl) {
        htmlRes += `<div class="mt-4"><a href="${escapeHtml(certificadoUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-lg fw-bold">🎓 Abrir / Descargar Certificado (PDF)</a></div>`;
      } else if (aprobado) {
        htmlRes += `<p class="small text-warning mt-3">${escapeHtml(res.mensajeCertificado || 'La aprobación quedó registrada, pero el certificado no se pudo generar. Volvé a cargar los cursos para reintentar.')}</p>`;
      }
      htmlRes += `</div>`;
      document.getElementById('cuerpoExamen').innerHTML = htmlRes;

      callGAS({ action: 'sincronizarSesion', token: state.tokenSesion }, function(refreshRes) {
        if (refreshRes && refreshRes.success) renderCapacitaciones(refreshRes.capacitaciones);
      });
    } else {
      document.getElementById('cuerpoExamen').innerHTML = `<div class="alert alert-danger">${escapeHtml(res ? res.message : 'Error al guardar resultado.')}</div>`;
    }
  });
}
