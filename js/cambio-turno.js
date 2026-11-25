import { state } from './state.js';
import { callGAS } from './api.js';

const ESTADOS_CAMBIO_TURNO = new Set([
  'Pendiente_Companero',
  'Pendiente_Jefe',
  'Aprobado_RRHH',
  'Finalizado_RRHH',
  'Rechazado'
]);

function normalizar(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escaparHtml(valor) {
  return String(valor == null ? '' : valor).replace(/[&<>"']/g, caracter => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[caracter]);
}

function obtenerUsuarioActual() {
  const usuario = state.usuarioActual && state.usuarioActual.usuario;
  return typeof usuario === 'string' ? usuario : (usuario && usuario.usuario) || '';
}

function tipoCambioTurnoSeleccionado() {
  const select = document.getElementById('permisoTipo');
  return !!select && normalizar(select.value).includes('cambio de turno');
}

function mostrarMensaje(tipo, texto) {
  const mensaje = document.getElementById('msgPermiso');
  if (!mensaje) return;
  mensaje.className = `alert alert-${tipo} mt-3`;
  mensaje.textContent = texto;
}

function insertarControlesCambioTurno() {
  const form = document.getElementById('formPermiso');
  const selectTipo = document.getElementById('permisoTipo');
  const inputDesde = document.getElementById('permisoDesde');
  const inputHasta = document.getElementById('permisoHasta');
  const inputDias = document.getElementById('permisoDias');
  if (!form || !selectTipo || !inputDesde || !inputHasta || !inputDias) return null;

  const panel = document.createElement('section');
  panel.id = 'panelCambioTurnoReal';
  panel.className = 'p-3 bg-info-subtle border border-info rounded-3 mb-3 d-none';
  panel.innerHTML = `
    <h6 class="fw-bold text-primary mb-2">Cambio de Turno / Franco</h6>
    <div class="mb-2">
      <label for="cambioTurnoCompanero" class="form-label fw-semibold small">Compañero/a de la misma unidad</label>
      <select id="cambioTurnoCompanero" class="form-select form-select-sm" required>
        <option value="">Seleccione un compañero/a...</option>
      </select>
      <div id="cambioTurnoSinCompaneros" class="form-text d-none">No hay compañeros disponibles en tu unidad.</div>
    </div>
    <div>
      <label for="horarioCambioTurno" class="form-label fw-semibold small">Describí el cambio de turno o franco</label>
      <textarea id="horarioCambioTurno" class="form-control form-control-sm" rows="3" maxlength="500" required placeholder="Ej.: cambio el turno mañana de 06 a 14 por el turno tarde de 14 a 22, o cambio de franco."></textarea>
    </div>`;
  selectTipo.closest('.mb-3').insertAdjacentElement('afterend', panel);

  const inputHastaCol = inputHasta.closest('.col, [class*="col-"]') || inputHasta.parentElement;
  const daysGroup = inputDias.closest('.mb-3');
  const desdeLabel = inputDesde.parentElement.querySelector('label');

  const bandeja = document.createElement('section');
  bandeja.id = 'bandejaCambioTurnoPersonal';
  bandeja.className = 'mb-3';
  const solicitudes = document.getElementById('listaMisSolicitudes');
  if (solicitudes) solicitudes.parentElement.insertBefore(bandeja, solicitudes);

  return { form, panel, inputDesde, inputHasta, inputDias, inputHastaCol, daysGroup, desdeLabel, bandeja };
}

function cambiarModoFormulario(refs) {
  const esCambio = tipoCambioTurnoSeleccionado();
  refs.panel.classList.toggle('d-none', !esCambio);
  refs.inputHastaCol.classList.toggle('d-none', esCambio);
  refs.daysGroup.classList.toggle('d-none', esCambio);

  const companero = document.getElementById('cambioTurnoCompanero');
  const horario = document.getElementById('horarioCambioTurno');
  companero.required = esCambio;
  horario.required = esCambio;
  if (refs.desdeLabel) refs.desdeLabel.textContent = esCambio ? 'Fecha del cambio' : 'Desde';
  refs.inputHasta.required = !esCambio;
  refs.inputDias.required = !esCambio;

  if (esCambio) {
    if (refs.inputDesde.value) refs.inputHasta.value = refs.inputDesde.value;
    refs.inputDias.value = '1';
    document.getElementById('desgloseCalculoDias').textContent = 'El cambio corresponde a una fecha.';
    document.getElementById('infoReglaPermiso').textContent = 'Elegí un compañero de tu unidad e indicá qué turno o franco desean intercambiar.';
  } else {
    document.getElementById('desgloseCalculoDias').textContent = '';
    const conf = (state.configPermisosGlobal || []).find(p => p.nombre === document.getElementById('permisoTipo').value);
    if (conf) refs.inputDesde.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function poblarCompaneros(select, companeros) {
  const anterior = select.value;
  select.replaceChildren(new Option('Seleccione un compañero/a...', ''));
  const usuarioActual = normalizar(obtenerUsuarioActual());
  (companeros || [])
    .filter(persona => normalizar(persona.usuario) !== usuarioActual)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
    .forEach(persona => select.add(new Option(`${persona.nombre} (Leg. ${persona.legajo})`, persona.usuario)));
  if ([...select.options].some(opcion => opcion.value === anterior)) select.value = anterior;
  document.getElementById('cambioTurnoSinCompaneros').classList.toggle('d-none', select.options.length > 1);
}

function renderSeguimiento(misSolicitudes) {
  const cont = document.getElementById('bandejaCambioTurnoPersonal');
  if (!cont) return;
  const cambios = (misSolicitudes || []).filter(s =>
    ESTADOS_CAMBIO_TURNO.has(s.estado) && (s.esCambioTurno || normalizar(s.tipoPermiso).includes('cambio de turno'))
  );
  if (!cambios.length) {
    cont.innerHTML = '';
    return;
  }

  const etiquetas = {
    Pendiente_Companero: 'Pendiente de aprobación de la persona propuesta',
    Pendiente_Jefe: 'Pendiente de aprobación de la jefatura',
    Aprobado_RRHH: 'Aprobado: nota lista para imprimir y firmar en la unidad',
    Finalizado_RRHH: 'Aprobado: nota lista para imprimir y firmar en la unidad',
    Rechazado: 'Rechazado'
  };
  cont.innerHTML = `<div class="alert alert-info mb-0"><h6 class="fw-bold">Seguimiento de cambios de turno</h6>${cambios.map(s => `
    <div class="border-top pt-2 mt-2">
      <div><strong>${escaparHtml(s.idTramite)}</strong> — ${escaparHtml(etiquetas[s.estado] || s.estado)}</div>
      <div class="small">Fecha: ${escaparHtml(s.fechaDesde || '')} · ${escaparHtml(s.motivo || '')}</div>
      ${s.obsResolucion ? `<div class="small">Respuesta: ${escaparHtml(s.obsResolucion)}</div>` : ''}
      ${s.urlNotaPDF ? `<a class="btn btn-outline-primary btn-sm mt-2" target="_blank" rel="noopener" href="${escaparHtml(s.urlNotaPDF)}">Descargar nota</a>` : ''}
    </div>`).join('')}</div>`;
}

function actualizarPanel(refs) {
  const usuario = obtenerUsuarioActual();
  if (!usuario || !state.tokenSesion) return;
  callGAS({ action: 'getPanelPermisos', usuario }, res => {
    if (!res || !res.success) {
      console.warn('No se pudo actualizar el panel de Cambio de Turno:', res && res.message);
      return;
    }
    poblarCompaneros(document.getElementById('cambioTurnoCompanero'), res.companerosSector || []);
    renderSeguimiento(res.misSolicitudes || []);
    renderAprobacionesCompanero(refs.bandeja, res.bandejaAprobacion || []);
  });
}

function renderAprobacionesCompanero(cont, bandeja) {
  const pendientes = (bandeja || []).filter(s => s.esConfirmacionOperario2 && s.estado === 'Pendiente_Companero');
  if (!pendientes.length) {
    cont.innerHTML = '';
    return;
  }
  cont.innerHTML = `<div class="card card-custom border-info mb-3">
    <div class="card-header-clean"><h6 class="fw-bold text-primary mb-0">Cambios de turno que requieren tu conformidad (${pendientes.length})</h6></div>
    <div class="card-body p-3">${pendientes.map(s => `
      <article class="tramite-item">
        <div class="fw-bold">${escaparHtml(s.nombre)} te propone un cambio</div>
        <div class="small">Trámite ${escaparHtml(s.idTramite)} · ${escaparHtml(s.fechaDesde)} · ${escaparHtml(s.motivo)}</div>
        <label class="form-label small mt-2" for="ctObs_${escaparHtml(s.idTramite)}">Observación (opcional)</label>
        <input id="ctObs_${escaparHtml(s.idTramite)}" class="form-control form-control-sm mb-2" maxlength="300">
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-success btn-sm js-ct-decision" data-id="${escaparHtml(s.idTramite)}" data-decision="APROBAR">Aprobar</button>
          <button type="button" class="btn btn-danger btn-sm js-ct-decision" data-id="${escaparHtml(s.idTramite)}" data-decision="RECHAZAR">Rechazar</button>
        </div>
      </article>`).join('')}</div></div>`;

  cont.querySelectorAll('.js-ct-decision').forEach(btn => btn.addEventListener('click', () => {
    const decision = btn.dataset.decision;
    if (!window.confirm(`¿Confirmás ${decision === 'APROBAR' ? 'aprobar' : 'rechazar'} este cambio de turno?`)) return;
    const obs = document.getElementById(`ctObs_${btn.dataset.id}`);
    btn.disabled = true;
    callGAS({
      action: 'firmarCambioTurnoCompanero',
      usuario: obtenerUsuarioActual(),
      idTramite: btn.dataset.id,
      decision,
      observacion: obs ? obs.value.trim() : ''
    }, res => {
      if (!res || !res.success) {
        btn.disabled = false;
        window.alert(res && res.message ? res.message : 'No se pudo registrar la decisión.');
        return;
      }
      window.alert(res.message);
      actualizarPanel({ bandeja: cont });
    });
  }));
}

function enviarCambioTurno(refs) {
  const tipoPermiso = document.getElementById('permisoTipo').value;
  const config = (state.configPermisosGlobal || []).find(p => p.nombre === tipoPermiso);
  const companeroUsuario = document.getElementById('cambioTurnoCompanero').value;
  const horarioCambioTurno = document.getElementById('horarioCambioTurno').value.trim();
  const fecha = refs.inputDesde.value;
  const firmaUsuario = document.getElementById('firmaUsuario').value.trim();
  const firmaClave = document.getElementById('firmaClave').value.trim();
  const btn = document.getElementById('btnEnviarPermiso');

  if (!fecha || !companeroUsuario || !horarioCambioTurno || !firmaUsuario || !firmaClave) {
    mostrarMensaje('danger', 'Completá la fecha, el compañero, la descripción del cambio y la firma electrónica.');
    return;
  }
  if (normalizar(companeroUsuario) === normalizar(obtenerUsuarioActual())) {
    mostrarMensaje('danger', 'No podés proponerte a vos mismo como compañero/a.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Firmando y enviando...';
  callGAS({
    action: 'crearPermiso',
    usuario: firmaUsuario,
    clave: firmaClave,
    tipoPermiso,
    tipoDiasAplicado: config ? config.tipoDias : ((state.usuarioActual && state.usuarioActual.modalidadDias) || 'CORRIDOS'),
    esVacaciones: false,
    fechaDesde: fecha,
    fechaHasta: fecha,
    cantDias: 1,
    companeroUsuario,
    horarioCambioTurno,
    motivo: document.getElementById('permisoMotivo').value.trim()
  }, res => {
    btn.disabled = false;
    btn.textContent = 'Enviar Solicitud a Aprobación';
    document.getElementById('firmaClave').value = '';
    if (res && res.success) {
      mostrarMensaje('success', res.message || 'Solicitud de cambio de turno enviada.');
      refs.form.reset();
      cambiarModoFormulario(refs);
      actualizarPanel(refs);
    } else {
      mostrarMensaje('danger', res && res.message ? res.message : 'Error al enviar la solicitud.');
    }
  });
}

export function initCambioTurno() {
  const refs = insertarControlesCambioTurno();
  if (!refs) return;

  document.getElementById('permisoTipo').addEventListener('change', () => cambiarModoFormulario(refs));
  refs.inputDesde.addEventListener('change', () => {
    if (tipoCambioTurnoSeleccionado()) refs.inputHasta.value = refs.inputDesde.value;
  });

  // Intercepta únicamente Cambio de Turno; los demás permisos siguen usando su flujo original.
  refs.form.addEventListener('submit', event => {
    if (!tipoCambioTurnoSeleccionado()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    enviarCambioTurno(refs);
  }, true);

  actualizarPanel(refs);
  window.setInterval(() => actualizarPanel(refs), 20000);
}
