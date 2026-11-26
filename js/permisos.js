import { state } from './state.js';
import { callGAS } from './api.js';
import { cambiarSubPestana } from './ui.js';
import { escapeHtml, safeExternalUrl } from './ui.js';
import {
  renderPanelDelegacionRRHH,
  poblarSelectorVacacionesRRHH,
  renderFeriadosRRHH
} from './rrhh.js';

function obtenerTipoDiasEfectivo(confPermiso) {
  if (!confPermiso) return state.usuarioActual.modalidadDias;
  if (confPermiso.tipoDias === "SEGUN_CONVENIO") return state.usuarioActual.modalidadDias;
  return confPermiso.tipoDias;
}

function esTipoCancelacion(confPermiso) {
  if (!confPermiso) return false;
  return (confPermiso.nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes("cancelacion");
}

function esPermisoCambioTurno(nombre) {
  return (nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes("cambio de turno");
}

function esEmpleadoGNC(data) {
  return (data.unidad || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim() === "gnc" &&
    (data.rol || "").toLowerCase() === "empleado" &&
    data.accesoRRHH !== true &&
    data.esDelegadoJefe !== true;
}

function calcularDiasEntreFechas(fechaInicioStr, fechaFinStr, modalidad) {
  const [y1, m1, d1] = fechaInicioStr.split('-').map(Number);
  const [y2, m2, d2] = fechaFinStr.split('-').map(Number);
  const inicio = new Date(y1, m1 - 1, d1);
  const fin = new Date(y2, m2 - 1, d2);

  if (fin < inicio) return { valido: false, mensaje: "La fecha 'Hasta' no puede ser anterior a 'Desde'." };

  let totalCalendario = 0;
  let totalHabiles = 0;
  let finesDeSemana = 0;
  let feriadosEncontrados = [];

  const setFeriados = new Set(state.feriadosGlobal.map(f => f.fecha));
  const cursor = new Date(inicio);

  while (cursor <= fin) {
    totalCalendario++;
    const diaSemana = cursor.getDay();
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;

    if (diaSemana === 0 || diaSemana === 6) {
      finesDeSemana++;
    } else if (setFeriados.has(iso)) {
      const ferObj = state.feriadosGlobal.find(f => f.fecha === iso);
      feriadosEncontrados.push(`${dd}/${mm} (${escapeHtml(ferObj ? ferObj.desc : 'Feriado')})`);
    } else {
      totalHabiles++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (modalidad === "CORRIDOS") {
    return {
      valido: true,
      diasComputados: totalCalendario,
      detalle: `Cómputo por <strong>Días Corridos</strong>: ${totalCalendario} día(s) calendario.`
    };
  } else {
    if (totalHabiles === 0) {
      return {
        valido: false,
        mensaje: "El rango seleccionado solo contiene sábados, domingos o feriados (0 días hábiles)."
      };
    }
    const infoExtra = [];
    if (finesDeSemana > 0) infoExtra.push(`${finesDeSemana} día(s) de fin de semana excluidos`);
    if (feriadosEncontrados.length > 0) infoExtra.push(`feriado excluido: ${feriadosEncontrados.join(', ')}`);

    return {
      valido: true,
      diasComputados: totalHabiles,
      detalle: `Cómputo por <strong>Días Hábiles</strong>: <strong>${totalHabiles} día(s)</strong> de ${totalCalendario} totales` +
               (infoExtra.length > 0 ? ` (${infoExtra.join('; ')}).` : '.')
    };
  }
}

export function inicializarModuloPermisos(data, esActualizacionSilenciosa = false) {
  state.configPermisosGlobal = (data.permisosConfig || []).filter(p =>
    !esPermisoCambioTurno(p.nombre) || esEmpleadoGNC(state.usuarioActual)
  );
  state.feriadosGlobal = data.feriados || [];
  state.misSolicitudesGlobal = data.misSolicitudes || [];
  state.empleadosRRHHGlobal = data.empleadosRRHHAdmin || [];
  state.bandejaRRHHGlobal = data.bandejaRRHH || [];
  state.historialSupervisionGlobal = data.historialSupervision || [];
  state.empleadosSectorJefeGlobal = data.empleadosSectorJefe || [];
  state.companerosSectorGlobal = data.companerosSector || [];

  if (esEmpleadoGNC(state.usuarioActual) &&
      !state.configPermisosGlobal.some(p => esPermisoCambioTurno(p.nombre))) {
    state.configPermisosGlobal.push({
      nombre: "Cambio de turno/franco",
      esVacaciones: false,
      tipoDias: "CORRIDOS",
      diasMax: 0,
      requiereComprobante: "NO"
    });
  }

  document.getElementById('badgeConvenioUsuario').innerText = data.convenio || "CCT";
  document.getElementById('badgeModalidadDias').innerText =
    data.modalidadDias === "HABILES" ? "Cómputo: Días Hábiles" : "Cómputo: Días Corridos";

  const select = document.getElementById('permisoTipo');
  if (!esActualizacionSilenciosa || select.options.length <= 1) {
    select.innerHTML = '<option value="">Seleccione un motivo...</option>';
    state.configPermisosGlobal.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.nombre;
      opt.innerText = p.nombre;
      select.appendChild(opt);
    });
    document.getElementById('panelCambioTurno').classList.add('d-none');
    const selCompanero = document.getElementById('turnoCompanero');
    selCompanero.innerHTML = '<option value="">Seleccioná un compañero/a...</option>';
    if (esEmpleadoGNC(state.usuarioActual)) {
      state.companerosSectorGlobal.forEach(companero => {
        const opt = document.createElement('option');
        opt.value = companero.usuario;
        opt.innerText = `${companero.nombre} (Leg. ${companero.legajo})`;
        selCompanero.appendChild(opt);
      });
    }
  }

  // Si tiene abierto el panel de saldo de vacaciones, mantener el número actualizado tras sincronización
  const selActual = select.value;
  const confActual = state.configPermisosGlobal.find(p => p.nombre === selActual);
  if (confActual && confActual.esVacaciones) {
    const mod = obtenerTipoDiasEfectivo(confActual);
    const etiq = mod === "HABILES" ? "días hábiles" : "días corridos";
    const spanSaldo = document.getElementById('textoSaldoDias');
    if (spanSaldo) spanSaldo.innerText = `${state.usuarioActual.diasVacaciones} ${etiq}`;
  }

  const rolNorm = (data.rol || "").toLowerCase();
  const esJefaRRHH = rolNorm === 'jefa_rrhh';
  const tieneModuloRRHH = esJefaRRHH || data.accesoRRHH === true;
  const esJefe = rolNorm === 'jefe';
  const esDelegadoJefe = data.esDelegadoJefe === true;
  const esGerente = rolNorm === 'gerente';
  const tieneConfirmacionesTurno = (data.bandejaAprobacion || []).some(s => s.esConfirmacionOperario2);

  // Visibilidad de Sub-pestañas según el Rol
  const itemPers = document.getElementById('itemSubTabPersonal');
  const itemJef = document.getElementById('itemSubTabJefatura');
  const itemRRHH = document.getElementById('itemSubTabRRHH');
  const itemHist = document.getElementById('itemSubTabHistorialGlobal');
  const colBandeja = document.getElementById('colBandejaAprobacion');
  const colDeleg = document.getElementById('colPanelDelegacionJefe');

  itemPers.classList.remove('d-none');
  itemJef.classList.add('d-none');
  itemRRHH.classList.add('d-none');
  itemHist.classList.add('d-none');
  colDeleg.classList.add('d-none');
  colBandeja.className = 'col-12 col-lg-7';

  if (esGerente) {
    itemPers.classList.add('d-none');
    itemJef.classList.remove('d-none');
    itemHist.classList.remove('d-none');
    colBandeja.className = 'col-12 col-lg-9 mx-auto';
    document.getElementById('labelSubTabJefatura').innerText = '📥 Autorizaciones de Gerencia';
    document.getElementById('tituloBandejaAprobacion').innerText = '🏛️ Solicitudes de Jefaturas y Jefa RRHH Pendientes';
    document.getElementById('subtituloBandejaAprobacion').innerText = 'Aprobación directa de jefes de sector y titular de RRHH (sin supervisión superior)';
  } else {
    document.getElementById('labelSubTabJefatura').innerText = '📥 Autorizaciones del Sector';
    document.getElementById('tituloBandejaAprobacion').innerText = '📥 Solicitudes Pendientes de Autorización';
    document.getElementById('subtituloBandejaAprobacion').innerText = 'El sistema detecta automáticamente superposiciones dentro del sector.';
  }

  if (esJefe || esDelegadoJefe || esJefaRRHH || tieneConfirmacionesTurno) {
    itemJef.classList.remove('d-none');
  }
  if (tieneConfirmacionesTurno && !esJefe && !esDelegadoJefe && !esJefaRRHH && !esGerente) {
    document.getElementById('labelSubTabJefatura').innerText = '🔄 Confirmar cambio de turno';
    document.getElementById('tituloBandejaAprobacion').innerText = '🔄 Solicitudes de cambio de turno para tu firma';
    document.getElementById('subtituloBandejaAprobacion').innerText = 'Ingresá tu usuario y clave para aceptar o rechazar la solicitud.';
  }

  if (esJefe) {
    colDeleg.classList.remove('d-none');
    renderPanelDelegacionJefe(state.empleadosSectorJefeGlobal);
  } else if (!esGerente) {
    colBandeja.className = 'col-12 col-lg-9 mx-auto';
  }

  if (esJefaRRHH) {
    document.getElementById('panelDelegacionJefaRRHH').classList.remove('d-none');
    renderPanelDelegacionRRHH(data.operariosDelegacion || []);
  } else {
    document.getElementById('panelDelegacionJefaRRHH').classList.add('d-none');
  }

  if (tieneModuloRRHH) {
    itemRRHH.classList.remove('d-none');
    if (!esActualizacionSilenciosa) {
      poblarSelectorVacacionesRRHH();
      renderFeriadosRRHH();
    }
  } else if (esJefe || esDelegadoJefe || esGerente) {
    itemHist.classList.remove('d-none');
    filtrarHistorialSupervision();
  }

  renderMisSolicitudes(state.misSolicitudesGlobal);
  renderBandejasAutorizacion(rolNorm, esDelegadoJefe, tieneModuloRRHH, data.bandejaAprobacion || [], state.bandejaRRHHGlobal);

  if (!esActualizacionSilenciosa) {
    if (tieneModuloRRHH) {
      cambiarSubPestana('rrhh');
    } else if (esGerente || esJefe || esDelegadoJefe || tieneConfirmacionesTurno) {
      cambiarSubPestana('jefatura');
    } else {
      cambiarSubPestana('personal');
    }
  }
}

function alSeleccionarTramiteCancelar() {
  const idSel = document.getElementById('permisoTramiteCancelar').value;
  const tramite = (state.misSolicitudesGlobal || []).find(s => s.idTramite === idSel);
  const infoCancel = document.getElementById('infoTramiteCancelar');
  const inputDesde = document.getElementById('permisoDesde');
  const inputHasta = document.getElementById('permisoHasta');
  const inputDias = document.getElementById('permisoDias');
  const btnEnviar = document.getElementById('btnEnviarPermiso');

  if (!tramite) {
    btnEnviar.disabled = true;
    return;
  }

  inputDesde.value = tramite.fechaDesdeISO;
  inputHasta.value = tramite.fechaHastaISO;
  inputDesde.readOnly = true;
  inputHasta.readOnly = true;
  inputDias.value = tramite.cantDias;
  btnEnviar.disabled = false;

  document.getElementById('desgloseCalculoDias').innerHTML =
    `Corresponde al trámite original <strong>${escapeHtml(tramite.idTramite)}</strong> (${escapeHtml(tramite.cantDias)} día/s).`;

  infoCancel.innerHTML = tramite.esVacaciones
    ? `🏖️ Este pedido descontó <strong>${escapeHtml(tramite.cantDias)} día(s) de vacaciones</strong>. Al aprobarse la cancelación, volverán a tu saldo.`
    : `📄 Licencia original: <strong>${escapeHtml(tramite.tipoPermiso)}</strong>.`;
}

function actualizarInfoPermiso() {
  const sel = document.getElementById('permisoTipo').value;
  const infoDiv = document.getElementById('infoReglaPermiso');
  const panelVac = document.getElementById('panelSaldoVacaciones');
  const panelCan = document.getElementById('panelCancelacionPedido');
  const panelCambioTurno = document.getElementById('panelCambioTurno');
  const bloqueFechas = document.getElementById('bloqueFechasPermiso');
  const bloqueCantidadDias = document.getElementById('bloqueCantidadDias');
  const inputDesde = document.getElementById('permisoDesde');
  const inputHasta = document.getElementById('permisoHasta');
  const inputDias = document.getElementById('permisoDias');
  const found = state.configPermisosGlobal.find(p => p.nombre === sel);

  panelVac.classList.add('d-none');
  if (panelCan) panelCan.classList.add('d-none');
  panelCambioTurno.classList.add('d-none');
  bloqueFechas.classList.remove('d-none');
  bloqueCantidadDias.classList.remove('d-none');
  inputDesde.required = true;
  inputHasta.required = true;
  inputDias.required = true;
  ['turnoCompanero', 'turnoFechaOriginal', 'turnoDesdeOriginal', 'turnoHastaOriginal', 'turnoFechaCambio', 'turnoDesdeCambio', 'turnoHastaCambio']
    .forEach(id => { document.getElementById(id).required = false; });
  document.getElementById('errorSaldoExcedido').classList.add('d-none');
  inputDesde.readOnly = false;
  inputHasta.readOnly = false;

  if (!found) {
    infoDiv.innerText = '';
    calcularDiasPermiso();
    return;
  }

  if (esPermisoCambioTurno(found.nombre)) {
    panelCambioTurno.classList.remove('d-none');
    bloqueFechas.classList.add('d-none');
    bloqueCantidadDias.classList.add('d-none');
    inputDesde.required = false;
    inputHasta.required = false;
    inputDias.required = false;
    ['turnoCompanero', 'turnoFechaOriginal', 'turnoDesdeOriginal', 'turnoHastaOriginal', 'turnoFechaCambio', 'turnoDesdeCambio', 'turnoHastaCambio']
      .forEach(id => { document.getElementById(id).required = true; });
    document.getElementById('permisoDias').value = '1';
    infoDiv.innerText = 'La solicitud se limita a empleados de GNC. Primero debe aceptar tu compañero y luego aprobar el jefe directo.';
    return;
  }

  if (esTipoCancelacion(found)) {
    infoDiv.innerText = '⚠️ Seleccioná el pedido aprobado que deseás anular. Si era de vacaciones, al aprobarse se te devolverán los días.';
    if (panelCan) panelCan.classList.remove('d-none');

    const selTramite = document.getElementById('permisoTramiteCancelar');
    const aprobados = (state.misSolicitudesGlobal || []).filter(s =>
      (s.estado === 'Aprobado_RRHH' || s.estado === 'Finalizado_RRHH') &&
      !s.tipoPermiso.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("cancelacion")
    );

    if (!aprobados.length) {
      selTramite.innerHTML = '<option value="">No tenés solicitudes aprobadas disponibles para cancelar...</option>';
      document.getElementById('infoTramiteCancelar').innerHTML = '';
      inputDesde.value = '';
      inputHasta.value = '';
      document.getElementById('permisoDias').value = '';
      document.getElementById('desgloseCalculoDias').innerHTML = '';
      document.getElementById('btnEnviarPermiso').disabled = true;
      return;
    }

    selTramite.innerHTML = aprobados.map(s =>
      `<option value="${escapeHtml(s.idTramite)}">${escapeHtml(s.idTramite)} — ${escapeHtml(s.tipoPermiso)} (${escapeHtml(s.fechaDesde)} al ${escapeHtml(s.fechaHasta)} - ${escapeHtml(s.cantDias)}d)</option>`
    ).join('');

    selTramite.onchange = alSeleccionarTramiteCancelar;
    alSeleccionarTramiteCancelar();
    return;
  }

  const modalidad = obtenerTipoDiasEfectivo(found);
  const etiquetaTipo = modalidad === "HABILES" ? "días hábiles" : "días corridos";

  if (found.esVacaciones) {
    infoDiv.innerText = '';
    panelVac.classList.remove('d-none');
    document.getElementById('textoSaldoDias').innerText = `${state.usuarioActual.diasVacaciones} ${etiquetaTipo}`;
    document.getElementById('subtextoModalidadVac').innerText =
      modalidad === "HABILES"
        ? "Tu convenio computa DÍAS HÁBILES (excluye sábados, domingos y feriados)."
        : "Tu convenio computa DÍAS CORRIDOS (incluye fines de semana y feriados).";
  } else {
    infoDiv.innerText = (found.diasMax > 0 ? `Máximo según convenio: ${found.diasMax} ${etiquetaTipo}. ` : '') +
      (found.requiereComprobante.toLowerCase() === 'si' ? '⚠️ Requiere comprobante (podrás subir la foto o PDF desde "Mis Solicitudes").' : 'No requiere comprobante.');
  }

  calcularDiasPermiso();
}

function calcularDiasPermiso() {
  const sel = document.getElementById('permisoTipo').value;
  const found = state.configPermisosGlobal.find(p => p.nombre === sel);
  if (esTipoCancelacion(found)) return;

  const d1 = document.getElementById('permisoDesde').value;
  const d2 = document.getElementById('permisoHasta').value;
  const modalidad = obtenerTipoDiasEfectivo(found);

  const inputDias = document.getElementById('permisoDias');
  const desgloseDiv = document.getElementById('desgloseCalculoDias');
  const errDiv = document.getElementById('errorSaldoExcedido');
  const btnEnviar = document.getElementById('btnEnviarPermiso');

  errDiv.classList.add('d-none');
  btnEnviar.disabled = false;

  if (!d1 || !d2) {
    inputDias.value = "";
    desgloseDiv.innerHTML = "";
    return;
  }

  const calc = calcularDiasEntreFechas(d1, d2, modalidad);
  if (!calc.valido) {
    inputDias.value = "";
    desgloseDiv.innerHTML = "";
    errDiv.innerHTML = `⛔ ${calc.mensaje}`;
    errDiv.classList.remove('d-none');
    btnEnviar.disabled = true;
    return;
  }

  inputDias.value = calc.diasComputados;
  desgloseDiv.innerHTML = calc.detalle;

  if (found && found.esVacaciones && calc.diasComputados > state.usuarioActual.diasVacaciones) {
    errDiv.innerHTML = `⛔ <strong>Saldo insuficiente:</strong> Estás solicitando <strong>${calc.diasComputados} día(s)</strong>, pero solo tenés <strong>${state.usuarioActual.diasVacaciones} día(s)</strong> disponibles. Seleccioná un rango menor.`;
    errDiv.classList.remove('d-none');
    btnEnviar.disabled = true;
  } else if (found && !found.esVacaciones && found.diasMax > 0 && calc.diasComputados > found.diasMax) {
    errDiv.innerHTML = `⛔ <strong>Excede el máximo del convenio:</strong> Esta licencia permite hasta <strong>${found.diasMax} día(s)</strong>.`;
    errDiv.classList.remove('d-none');
    btnEnviar.disabled = true;
  }
}

function abrirModalSubirComprobante(idTramite) {
  document.getElementById('compHiddenIdTramite').value = idTramite;
  document.getElementById('compModalIdTramite').innerText = idTramite;
  document.getElementById('compArchivoInput').value = '';
  document.getElementById('compMensaje').classList.add('d-none');
  new window.bootstrap.Modal(document.getElementById('modalSubirComprobante')).show();
}

function renderBloqueComprobanteHtml(s, esElSolicitante, esRRHH) {
  const comprobanteUrl = safeExternalUrl(s.urlComprobante);
  const notaPdfUrl = safeExternalUrl(s.urlNotaPDF);
  const mostrarAlgo = s.requiereComprobante || comprobanteUrl || notaPdfUrl;
  if (!mostrarAlgo) return '';

  let html = '<div class="mt-2 d-flex flex-wrap align-items-center gap-2">';

  if (comprobanteUrl) {
    html += `<a href="${escapeHtml(comprobanteUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-primary btn-sm fw-bold">📄 Ver Comprobante Adjunto</a>`;
  } else if (s.requiereComprobante) {
    html += `<span class="badge bg-warning text-dark">⚠️ Pendiente de comprobante</span>`;
  }

  if (notaPdfUrl) {
    html += `<a href="${escapeHtml(notaPdfUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-success btn-sm fw-bold">🖨️ Ver / Imprimir Nota PDF (Firma)</a>`;
  }

  if (esElSolicitante && s.requiereComprobante && s.estado !== 'Rechazado' && s.estado !== 'Anulado') {
    const textoBtn = comprobanteUrl ? '🔄 Reemplazar Comprobante' : '📎 Subir Comprobante (Foto/PDF)';
    html += `<button type="button" class="btn btn-outline-dark btn-sm fw-semibold btn-subir-comp" data-id="${escapeHtml(s.idTramite)}">${textoBtn}</button>`;
  }

  html += '</div>';
  return html;
}

function renderDetalleCambioTurno(s) {
  const cambio = s.cambioTurnoInfo;
  if (!s.esCambioTurno || !cambio) return '';
  return `
    <div class="small text-secondary mt-1">
      <strong>Compañero/a:</strong> ${escapeHtml(cambio.reempNombre)} (Leg. ${escapeHtml(cambio.reempLegajo)})<br>
      <strong>Turno original:</strong> ${escapeHtml(s.fechaDesde)} ${escapeHtml(cambio.horarioOriginal || cambio.horario)}<br>
      <strong>Turno/franco a intercambiar:</strong> ${escapeHtml(s.fechaHasta)} ${escapeHtml(cambio.horarioCambio || '')}
      ${cambio.detalleLimpio ? `<br><strong>Observaciones:</strong> ${escapeHtml(cambio.detalleLimpio)}` : ''}
    </div>`;
}

function renderMisSolicitudes(lista) {
  const cont = document.getElementById('listaMisSolicitudes');
  if (!lista.length) {
    cont.innerHTML = '<p class="text-muted small mb-0">Aún no realizaste solicitudes de permisos.</p>';
    return;
  }

  let html = '';
  lista.forEach(s => {
    let badge = '<span class="badge bg-warning text-dark">Pendiente de Aprobación</span>';
    if (s.estado === 'Aprobado_RRHH') badge = '<span class="badge bg-success">✓ Aprobado (En RRHH)</span>';
    if (s.estado === 'Finalizado_RRHH') badge = '<span class="badge bg-primary">✓ Documentado por RRHH</span>';
    if (s.estado === 'Pendiente_Companero') badge = '<span class="badge bg-info text-dark">Esperando firma del compañero</span>';
    if (s.estado === 'Pendiente_Jefe' && s.esCambioTurno) badge = '<span class="badge bg-warning text-dark">Esperando aprobación del jefe GNC</span>';
    if (s.estado === 'Aprobado_GNC_Pendiente_Nota') badge = '<span class="badge bg-warning text-dark">Aprobado por jefatura; nota pendiente</span>';
    if (s.estado === 'Finalizado_GNC') badge = '<span class="badge bg-success">✓ Aprobado y finalizado por Jefatura GNC</span>';
    if (s.estado === 'Rechazado') badge = '<span class="badge bg-danger">✕ Denegado (Elegir otra fecha)</span>';
    if (s.estado === 'Anulado') badge = '<span class="badge bg-secondary">🚫 Anulado</span>';

    html += `
      <div class="tramite-item">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
          <strong>${escapeHtml(s.tipoPermiso)}</strong>
          ${badge}
        </div>
        <div class="small text-muted">
          Trámite: <strong>${escapeHtml(s.idTramite)}</strong>
          ${s.esCambioTurno
            ? ''
            : ` | Del <strong>${escapeHtml(s.fechaDesde)}</strong> al <strong>${escapeHtml(s.fechaHasta)}</strong> (<strong>${escapeHtml(s.cantDias)} día/s ${escapeHtml(s.tipoDiasAplicado ? s.tipoDiasAplicado.toLowerCase() : '')}</strong>)`}
        </div>
        ${s.esCambioTurno ? renderDetalleCambioTurno(s) : (s.motivo ? `<div class="small text-secondary mt-1">${escapeHtml(s.motivo)}</div>` : '')}
        ${s.obsResolucion ? `<div class="small text-dark mt-2 bg-light p-2 rounded border">Respuesta (${escapeHtml(s.resueltoPor)}): ${escapeHtml(s.obsResolucion)}</div>` : ''}
        ${renderBloqueComprobanteHtml(s, true, false)}
      </div>`;
  });
  cont.innerHTML = html;

  cont.querySelectorAll('.btn-subir-comp').forEach(btn => {
    btn.addEventListener('click', () => abrirModalSubirComprobante(btn.dataset.id));
  });
}

function renderBandejasAutorizacion(rolNorm, esDelegadoJefe, tieneModuloRRHH, bandejaJefe, bandejaRRHH) {
  const badgeNotif = document.getElementById('badgeNotificacionPermisos');
  const alertaSup = document.getElementById('alertaPendientesSuperior');
  const textoBanner = document.getElementById('textoBannerTareas');
  const btnBanner = document.getElementById('btnIrATareaPendiente');
  const badgeSubJef = document.getElementById('badgeSubTabJef');
  const pillJef = document.getElementById('pillPendientesBandeja');
  const badgeSubRRHH = document.getElementById('badgeSubTabRRHH');
  const contBandejaJefe = document.getElementById('listaBandejaJefe');
  const valoresInputsPrevios = {};
  let focoPrevio = null;
  let posicionFoco = null;
  contBandejaJefe.querySelectorAll('input[id^="obs_"], input[id^="firmaUsr_"], input[id^="firmaClave_"]').forEach(inp => {
    valoresInputsPrevios[inp.id] = inp.value;
    if (inp === document.activeElement) {
      focoPrevio = inp.id;
      posicionFoco = typeof inp.selectionStart === 'number' ? inp.selectionStart : null;
    }
  });

  const esJefatura = rolNorm === 'jefe' || rolNorm === 'gerente' || rolNorm === 'jefa_rrhh' || esDelegadoJefe;
  const tieneConfirmacionesTurno = bandejaJefe.some(s => s.esConfirmacionOperario2);
  let pendientesJef = bandejaJefe.length;
  let pendientesRRHH = tieneModuloRRHH ? bandejaRRHH.filter(x => x.estado === 'Aprobado_RRHH').length : 0;
  let totalPendientes = 0;

  if (esJefatura || tieneConfirmacionesTurno) {
    totalPendientes += pendientesJef;
    pillJef.innerText = `${pendientesJef} pendiente(s)`;
    if (pendientesJef > 0) {
      badgeSubJef.innerText = pendientesJef;
      badgeSubJef.classList.remove('d-none');
    } else {
      badgeSubJef.classList.add('d-none');
    }

    const cont = contBandejaJefe;

    if (!bandejaJefe.length) {
      cont.innerHTML = '<p class="text-muted small mb-0">No tenés solicitudes pendientes de aprobación.</p>';
    } else {
      let html = '';
      bandejaJefe.forEach(s => {
        if (s.esConfirmacionOperario2) {
          html += `
            <div class="tramite-item bg-info-subtle border-info" data-turno-id="${escapeHtml(s.idTramite)}">
              <div class="d-flex justify-content-between flex-wrap mb-1">
                <span class="fw-bold text-dark">🔄 Cambio de turno/franco solicitado por ${escapeHtml(s.nombre)}</span>
                <span class="badge bg-secondary">${escapeHtml(s.idTramite)}</span>
              </div>
              <div class="small mb-2"><strong>Sector:</strong> ${escapeHtml(s.unidad)} | <strong>Legajo:</strong> ${escapeHtml(s.legajo)}</div>
              ${renderDetalleCambioTurno(s)}
              <input type="text" id="obs_${escapeHtml(s.idTramite)}" class="form-control form-control-sm mb-2" placeholder="Observación (opcional)">
              <div class="row g-2 mb-2">
                <div class="col-sm-6">
                  <input type="text" id="firmaUsr_${escapeHtml(s.idTramite)}" class="form-control form-control-sm" placeholder="Tu usuario para firmar" autocomplete="username" required>
                </div>
                <div class="col-sm-6">
                  <input type="password" id="firmaClave_${escapeHtml(s.idTramite)}" class="form-control form-control-sm" placeholder="Tu clave para firmar" autocomplete="current-password" required>
                </div>
              </div>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-success btn-sm fw-bold flex-fill btn-resolver-companero" data-id="${escapeHtml(s.idTramite)}" data-dec="APROBAR">✓ Aceptar y enviar al jefe</button>
                <button type="button" class="btn btn-danger btn-sm fw-bold flex-fill btn-resolver-companero" data-id="${escapeHtml(s.idTramite)}" data-dec="RECHAZAR">✕ Rechazar</button>
              </div>
            </div>`;
          return;
        }
        if (s.esReintentoNotaGNC) {
          html += `
            <div class="tramite-item bg-warning-subtle border-warning">
              <div class="d-flex justify-content-between flex-wrap mb-1">
                <span class="fw-bold text-dark">✓ Aprobado por jefatura: falta generar la nota</span>
                <span class="badge bg-secondary">${escapeHtml(s.idTramite)}</span>
              </div>
              <div class="small mb-2">
                <strong>Empleado:</strong> ${escapeHtml(s.nombre)} (Leg. ${escapeHtml(s.legajo)})<br>
                ${renderDetalleCambioTurno(s)}
              </div>
              <button class="btn btn-primary btn-sm fw-bold w-100 btn-resolver" data-id="${escapeHtml(s.idTramite)}" data-dec="REGENERAR_NOTA_GNC">📄 Reintentar generar nota PDF</button>
            </div>`;
          return;
        }
        let alertaConflictoHtml = '';
        if (s.conflictos && s.conflictos.length > 0) {
          const detalle = s.conflictos.map(c =>
            `<strong>${escapeHtml(c.nombre)}</strong> (${escapeHtml(c.tipoPermiso)}: del ${escapeHtml(c.fechaDesde)} al ${escapeHtml(c.fechaHasta)} - <em>${escapeHtml(c.estado)}</em>)`
          ).join('<br>');
          alertaConflictoHtml = `
            <div class="alerta-superposicion my-2">
              ⚠️ <strong>¡Alerta de Superposición en ${escapeHtml(s.unidad)}!</strong> Las fechas coinciden con:<br>
              ${detalle}
            </div>`;
        }

        html += `
          <div class="tramite-item bg-light">
            <div class="d-flex justify-content-between flex-wrap mb-1">
              <span class="fw-bold text-dark">${escapeHtml(s.nombre)} <span class="text-muted fw-normal small">(Leg. ${escapeHtml(s.legajo)} - ${escapeHtml(s.unidad)})</span></span>
              <span class="badge bg-secondary">${escapeHtml(s.idTramite)}</span>
            </div>
            <div class="small mb-2">
              <strong>Motivo:</strong> ${escapeHtml(s.tipoPermiso)}<br>
              ${s.esCambioTurno
                ? renderDetalleCambioTurno(s)
                : `<strong>Fechas:</strong> ${escapeHtml(s.fechaDesde)} al ${escapeHtml(s.fechaHasta)} (<strong>${escapeHtml(s.cantDias)} día/s ${escapeHtml(s.tipoDiasAplicado ? s.tipoDiasAplicado.toLowerCase() : '')}</strong>)<br>${s.motivo ? `<strong>Detalle empleado:</strong> ${escapeHtml(s.motivo)}` : ''}`}
            </div>
            ${renderBloqueComprobanteHtml(s, false, false)}
            ${alertaConflictoHtml}
            <div class="mt-2">
              <input type="text" id="obs_${escapeHtml(s.idTramite)}" class="form-control form-control-sm mb-2" placeholder="Observación (ej: Motivo si denegás por cobertura)...">
              <div class="d-flex gap-2">
                <button class="btn btn-success btn-sm fw-bold flex-fill btn-resolver" data-id="${escapeHtml(s.idTramite)}" data-dec="APROBAR">${s.esCambioTurno ? '✓ Aprobar y cerrar trámite' : '✓ Aprobar y Enviar a RRHH'}</button>
                <button class="btn btn-danger btn-sm fw-bold flex-fill btn-resolver" data-id="${escapeHtml(s.idTramite)}" data-dec="RECHAZAR">✕ Denegar / Pedir otra fecha</button>
              </div>
            </div>
          </div>`;
      });
      cont.innerHTML = html;

      Object.keys(valoresInputsPrevios).forEach(idInp => {
        const el = document.getElementById(idInp);
        if (el) el.value = valoresInputsPrevios[idInp];
      });
      if (focoPrevio) {
        const el = document.getElementById(focoPrevio);
        if (el) {
          el.focus();
          if (posicionFoco !== null && typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(posicionFoco, posicionFoco);
          }
        }
      }

      cont.querySelectorAll('.btn-resolver').forEach(btn => {
        btn.addEventListener('click', () => resolverTramite(btn.dataset.id, btn.dataset.dec));
      });
      cont.querySelectorAll('.btn-resolver-companero').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const usuario = document.getElementById(`firmaUsr_${id}`).value.trim();
          const clave = document.getElementById(`firmaClave_${id}`).value;
          if (!usuario || !clave) {
            alert('Ingresá tu usuario y clave para firmar esta respuesta.');
            return;
          }
          resolverTramite(id, btn.dataset.dec, usuario, clave);
        });
      });
    }
  } else {
    document.getElementById('listaBandejaJefe').innerHTML = '<p class="text-muted small mb-0">No tenés solicitudes pendientes de firma.</p>';
    badgeSubJef.classList.add('d-none');
    document.getElementById('itemSubTabJefatura').classList.add('d-none');
    if (document.getElementById('subTabJefatura').classList.contains('active')) {
      cambiarSubPestana('personal');
    }
  }

  if (tieneModuloRRHH) {
    totalPendientes += pendientesRRHH;
    if (pendientesRRHH > 0) {
      badgeSubRRHH.innerText = `${pendientesRRHH} por documentar`;
      badgeSubRRHH.classList.remove('d-none');
    } else {
      badgeSubRRHH.classList.add('d-none');
    }
    filtrarBandejaRRHH();
  }

  if (totalPendientes > 0) {
    badgeNotif.innerText = totalPendientes;
    badgeNotif.classList.remove('d-none');
    textoBanner.innerText = `🔔 Tenés ${totalPendientes} solicitud(es) pendiente(s) de gestión en tus bandejas.`;
    btnBanner.onclick = () => {
      if (pendientesJef > 0) cambiarSubPestana('jefatura');
      else if (pendientesRRHH > 0) cambiarSubPestana('rrhh');
    };
    alertaSup.classList.remove('d-none');
  } else {
    badgeNotif.classList.add('d-none');
    alertaSup.classList.add('d-none');
  }
}

function renderListaBandejaRRHH(lista) {
  const cont = document.getElementById('listaBandejaRRHH');
  if (!lista.length) {
    cont.innerHTML = '<p class="text-muted small mb-0">No hay permisos aprobados que coincidan con la búsqueda.</p>';
    return;
  }

  let html = '';
  lista.forEach(s => {
    const pendienteDoc = s.estado === 'Aprobado_RRHH';
    html += `
      <div class="tramite-item ${pendienteDoc ? 'tramite-pendiente-doc' : ''}">
        <div class="d-flex justify-content-between flex-wrap gap-1 mb-1">
          <span class="fw-bold">${escapeHtml(s.nombre)} <span class="text-muted fw-normal small">(Leg. ${escapeHtml(s.legajo)} - ${escapeHtml(s.unidad)})</span></span>
          <div>
            <span class="badge bg-secondary me-1">${escapeHtml(s.idTramite)}</span>
            <span class="badge ${pendienteDoc ? 'bg-danger' : 'bg-success'}">${pendienteDoc ? 'Pendiente Documentar' : 'Finalizado'}</span>
          </div>
        </div>
        <div class="small">
          <strong>Permiso:</strong> ${escapeHtml(s.tipoPermiso)}${s.esCambioTurno
            ? ''
            : ` | <strong>Fechas:</strong> ${escapeHtml(s.fechaDesde)} al ${escapeHtml(s.fechaHasta)} (${escapeHtml(s.cantDias)} día/s ${escapeHtml(s.tipoDiasAplicado ? s.tipoDiasAplicado.toLowerCase() : '')})`}<br>
          ${s.esCambioTurno ? renderDetalleCambioTurno(s) : (s.motivo ? `<strong>Detalle:</strong> ${escapeHtml(s.motivo)}<br>` : '')}
          <strong>Estado gestión:</strong> ${escapeHtml(s.resueltoPor)} (${escapeHtml(s.fechaResolucion)})
        </div>
        ${renderBloqueComprobanteHtml(s, false, true)}
        ${pendienteDoc ? `
          <div class="mt-2">
            <button id="btnFinRRHH_${escapeHtml(s.idTramite)}" class="btn btn-primary btn-sm fw-bold w-100 btn-fin-rrhh" data-id="${escapeHtml(s.idTramite)}">📄 Marcar Documentación Generada y Crear Nota PDF</button>
          </div>` : ''}
      </div>`;
  });
  cont.innerHTML = html;

  cont.querySelectorAll('.btn-fin-rrhh').forEach(btn => {
    btn.addEventListener('click', () => resolverTramite(btn.dataset.id, 'FINALIZAR_RRHH'));
  });
}

function filtrarBandejaRRHH() {
  const input = document.getElementById('filtroBandejaRRHHInput');
  const q = input ? input.value.trim().toLowerCase() : '';
  if (!q) {
    renderListaBandejaRRHH(state.bandejaRRHHGlobal);
    return;
  }
  const filtrados = state.bandejaRRHHGlobal.filter(s =>
    s.nombre.toLowerCase().includes(q) ||
    s.unidad.toLowerCase().includes(q) ||
    s.idTramite.toLowerCase().includes(q) ||
    s.tipoPermiso.toLowerCase().includes(q) ||
    s.legajo.toLowerCase().includes(q)
  );
  renderListaBandejaRRHH(filtrados);
}

function renderHistorialSupervision(lista) {
  const cont = document.getElementById('listaHistorialSupervision');
  if (!lista.length) {
    cont.innerHTML = '<p class="text-muted small mb-0">No hay registros históricos para mostrar.</p>';
    return;
  }

  let html = '<div style="max-height: 500px; overflow-y: auto;">';
  lista.forEach(s => {
    let badge = '<span class="badge bg-warning text-dark">Pendiente</span>';
    if (s.estado === 'Aprobado_RRHH') badge = '<span class="badge bg-success">Aprobado</span>';
    if (s.estado === 'Finalizado_RRHH') badge = '<span class="badge bg-primary">Finalizado RRHH</span>';
    if (s.estado === 'Aprobado_GNC_Pendiente_Nota') badge = '<span class="badge bg-warning text-dark">Aprobado; nota pendiente</span>';
    if (s.estado === 'Finalizado_GNC') badge = '<span class="badge bg-success">Finalizado por Jefatura GNC</span>';
    if (s.estado === 'Rechazado') badge = '<span class="badge bg-danger">Denegado</span>';
    if (s.estado === 'Anulado') badge = '<span class="badge bg-secondary">🚫 Anulado</span>';

    html += `
      <div class="tramite-item">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
          <span><strong>${escapeHtml(s.nombre)}</strong> <span class="text-muted small">(Leg. ${escapeHtml(s.legajo)} - ${escapeHtml(s.unidad)})</span></span>
          ${badge}
        </div>
        <div class="small text-muted">
          <strong>${escapeHtml(s.idTramite)}</strong> | ${escapeHtml(s.tipoPermiso)}${s.esCambioTurno
            ? ''
            : ` | Del <strong>${escapeHtml(s.fechaDesde)}</strong> al <strong>${escapeHtml(s.fechaHasta)}</strong> (${escapeHtml(s.cantDias)}d)`}
        </div>
        ${s.esCambioTurno ? renderDetalleCambioTurno(s) : (s.motivo ? `<div class="small text-secondary mt-1">${escapeHtml(s.motivo)}</div>` : '')}
        ${renderBloqueComprobanteHtml(s, false, false)}
      </div>`;
  });
  html += '</div>';
  cont.innerHTML = html;
}

function filtrarHistorialSupervision() {
  const input = document.getElementById('filtroHistorialInput');
  const q = input ? input.value.trim().toLowerCase() : '';
  if (!q) {
    renderHistorialSupervision(state.historialSupervisionGlobal);
    return;
  }
  const filtrados = state.historialSupervisionGlobal.filter(s =>
    s.nombre.toLowerCase().includes(q) ||
    s.unidad.toLowerCase().includes(q) ||
    s.idTramite.toLowerCase().includes(q) ||
    s.tipoPermiso.toLowerCase().includes(q) ||
    s.legajo.toLowerCase().includes(q)
  );
  renderHistorialSupervision(filtrados);
}

function resolverTramite(idTramite, decision, firmaUsuario = '', firmaClave = '') {
  const msgConfirm = decision === 'APROBAR'
    ? `¿Confirmás aprobar el trámite ${idTramite}?`
    : (decision === 'RECHAZAR'
      ? `¿Confirmás DENEGAR el trámite ${idTramite}?`
      : (decision === 'REGENERAR_NOTA_GNC'
        ? `La aprobación ya está registrada. ¿Reintentar generar la nota PDF de ${idTramite}?`
        : `¿Confirmás finalizar el trámite ${idTramite} y generar automáticamente la Nota PDF para firma manuscrita?`));

  if (!confirm(msgConfirm)) return;

  const btnFin = document.getElementById(`btnFinRRHH_${idTramite}`);
  if (btnFin) {
    btnFin.disabled = true;
    btnFin.innerText = "Generando Nota PDF...";
  }

  const obsInput = document.getElementById(`obs_${idTramite}`);
  const obs = obsInput ? obsInput.value.trim() : "";

  callGAS({
    action: 'resolverPermiso',
    usuario: firmaUsuario || state.usuarioActual.usuario,
    clave: firmaClave || state.claveSesionTemporal,
    idTramite: idTramite,
    decision: decision,
    observacion: obs
  }, function(res) {
    if (btnFin) {
      btnFin.disabled = false;
      btnFin.innerText = "📄 Marcar Documentación Generada y Crear Nota PDF";
    }

    if (res && res.success) {
      alert(res.message);
      if (res.misSolicitudes) {
        state.misSolicitudesGlobal = res.misSolicitudes;
        renderMisSolicitudes(state.misSolicitudesGlobal);
      }
      if (res.urlNotaPDF) {
        const notaPdfUrl = safeExternalUrl(res.urlNotaPDF);
        if (notaPdfUrl) window.open(notaPdfUrl, '_blank', 'noopener,noreferrer');
      }

      const rolNorm = (state.usuarioActual.rol || "").toLowerCase();
      const esDelegadoJefe = state.usuarioActual.esDelegadoJefe === true;
      const tieneModuloRRHH = rolNorm === 'jefa_rrhh' || state.usuarioActual.accesoRRHH === true;

      if (res.empleadosRRHHAdmin) {
        state.empleadosRRHHGlobal = res.empleadosRRHHAdmin;
        poblarSelectorVacacionesRRHH();
      }
      if (res.bandejaRRHH) {
        state.bandejaRRHHGlobal = res.bandejaRRHH;
      }
      if (res.historialSupervision) {
        state.historialSupervisionGlobal = res.historialSupervision;
        filtrarHistorialSupervision();
      }
      renderBandejasAutorizacion(rolNorm, esDelegadoJefe, tieneModuloRRHH, res.bandejaAprobacion || [], state.bandejaRRHHGlobal);
    } else {
      alert(res ? res.message : "Error al procesar la acción.");
    }
  });
}

// Delegación Jefe de Unidad (hasta 4 personas)
function renderPanelDelegacionJefe(listaEmpleados) {
  const activos = listaEmpleados.filter(e => e.delegadoActivo);
  const disponibles = listaEmpleados.filter(e => !e.delegadoActivo);

  document.getElementById('contadorDelegadosJefe').innerText = `${activos.length} / 4 activos`;

  const contActivos = document.getElementById('listaDelegadosJefeActivos');
  if (!activos.length) {
    contActivos.innerHTML = '<div class="list-group-item text-muted small">No tenés delegados activos actualmente.</div>';
  } else {
    contActivos.innerHTML = activos.map(d => `
      <div class="list-group-item d-flex justify-content-between align-items-center py-2">
        <div>
          <strong class="small">${escapeHtml(d.nombre)}</strong> <span class="text-muted small">(Leg. ${escapeHtml(d.legajo)})</span>
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm fw-bold btn-revocar-jefe" data-usr="${escapeHtml(d.usuario)}">🚫 Revocar</button>
      </div>
    `).join('');

    contActivos.querySelectorAll('.btn-revocar-jefe').forEach(btn => {
      btn.addEventListener('click', () => cambiarDelegacionJefe(btn.dataset.usr, false));
    });
  }

  poblarSelectCandidatosJefe(disponibles);
  document.getElementById('btnAgregarDelegadoJefe').disabled = activos.length >= 4 || disponibles.length === 0;
}

function poblarSelectCandidatosJefe(disponibles) {
  const sel = document.getElementById('selectCandidatoDelegadoJefe');
  const seleccionado = sel.value;
  if (!disponibles.length) {
    sel.innerHTML = '<option value="">No hay más empleados disponibles...</option>';
    return;
  }
  sel.innerHTML = disponibles
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(d => `<option value="${escapeHtml(d.usuario)}">${escapeHtml(d.nombre)} (Leg. ${escapeHtml(d.legajo)})</option>`)
    .join('');
  if ([...sel.options].some(option => option.value === seleccionado)) {
    sel.value = seleccionado;
  }
}

function filtrarSelectDelegadosJefe() {
  const q = document.getElementById('buscadorEmpleadoDelegar').value.trim().toLowerCase();
  const disponibles = state.empleadosSectorJefeGlobal.filter(e =>
    !e.delegadoActivo && (e.nombre.toLowerCase().includes(q) || e.legajo.toLowerCase().includes(q))
  );
  poblarSelectCandidatosJefe(disponibles);
}

function cambiarDelegacionJefe(usuarioDelegado, habilitar) {
  callGAS({
    action: 'toggleDelegacionJefe',
    usuario: state.usuarioActual.usuario,
    clave: state.claveSesionTemporal,
    usuarioDelegado: usuarioDelegado,
    habilitar: habilitar
  }, function(res) {
    if (res && res.success) {
      state.empleadosSectorJefeGlobal = res.empleadosSectorJefe || [];
      document.getElementById('buscadorEmpleadoDelegar').value = "";
      renderPanelDelegacionJefe(state.empleadosSectorJefeGlobal);
      alert(res.message);
    } else {
      alert(res ? res.message : "Error al actualizar delegación.");
    }
  });
}

export function initPermisosEvents() {
  document.getElementById('permisoTipo').addEventListener('change', actualizarInfoPermiso);
  document.getElementById('permisoDesde').addEventListener('change', calcularDiasPermiso);
  document.getElementById('permisoHasta').addEventListener('change', calcularDiasPermiso);
  document.getElementById('filtroBandejaRRHHInput').addEventListener('keyup', filtrarBandejaRRHH);
  document.getElementById('filtroHistorialInput').addEventListener('keyup', filtrarHistorialSupervision);
  document.getElementById('buscadorEmpleadoDelegar').addEventListener('keyup', filtrarSelectDelegadosJefe);

  document.getElementById('btnAgregarDelegadoJefe').addEventListener('click', () => {
    const usr = document.getElementById('selectCandidatoDelegadoJefe').value;
    if (usr) cambiarDelegacionJefe(usr, true);
  });

  // Envío de solicitud
  document.getElementById('formPermiso').addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnEnviarPermiso');
    const msgDiv = document.getElementById('msgPermiso');
    msgDiv.classList.add('d-none');

    const tipoSel = document.getElementById('permisoTipo').value;
    const conf = state.configPermisosGlobal.find(p => p.nombre === tipoSel);
    const modalidad = obtenerTipoDiasEfectivo(conf);
    const esCancel = esTipoCancelacion(conf);
    const esCambioTurno = esPermisoCambioTurno(tipoSel);
    const horarioCambioTurno = esCambioTurno
      ? `Turno original: ${document.getElementById('turnoDesdeOriginal').value}-${document.getElementById('turnoHastaOriginal').value}; turno/franco a intercambiar: ${document.getElementById('turnoDesdeCambio').value}-${document.getElementById('turnoHastaCambio').value}`
      : '';

    const payload = {
      action: 'crearPermiso',
      usuario: document.getElementById('firmaUsuario').value.trim(),
      clave: document.getElementById('firmaClave').value.trim(),
      tipoPermiso: tipoSel,
      companeroUsuario: esCambioTurno ? document.getElementById('turnoCompanero').value : '',
      horarioCambioTurno: horarioCambioTurno,
      fechaTurnoOriginal: esCambioTurno ? document.getElementById('turnoFechaOriginal').value : '',
      inicioTurnoOriginal: esCambioTurno ? document.getElementById('turnoDesdeOriginal').value : '',
      finTurnoOriginal: esCambioTurno ? document.getElementById('turnoHastaOriginal').value : '',
      fechaTurnoCambio: esCambioTurno ? document.getElementById('turnoFechaCambio').value : '',
      inicioTurnoCambio: esCambioTurno ? document.getElementById('turnoDesdeCambio').value : '',
      finTurnoCambio: esCambioTurno ? document.getElementById('turnoHastaCambio').value : '',
      idTramiteCancelar: esCancel ? document.getElementById('permisoTramiteCancelar').value : '',
      tipoDiasAplicado: modalidad,
      esVacaciones: conf ? conf.esVacaciones : false,
      fechaDesde: esCambioTurno
        ? document.getElementById('turnoFechaOriginal').value
        : document.getElementById('permisoDesde').value,
      fechaHasta: esCambioTurno
        ? document.getElementById('turnoFechaCambio').value
        : document.getElementById('permisoHasta').value,
      cantDias: esCambioTurno ? '1' : document.getElementById('permisoDias').value,
      motivo: document.getElementById('permisoMotivo').value.trim()
    };

    btn.disabled = true;
    btn.innerText = esCambioTurno ? "Firmando y enviando al compañero..." : "Firmando y enviando...";

    callGAS(payload, function(res) {
      btn.disabled = false;
      btn.innerText = "Enviar Solicitud a Aprobación";
      document.getElementById('firmaClave').value = "";
      msgDiv.classList.remove('d-none');

      if (res && res.success) {
        msgDiv.className = "alert alert-success mt-3";
        msgDiv.innerText = res.message;
        document.getElementById('formPermiso').reset();
        actualizarInfoPermiso();
        document.getElementById('permisoDesde').readOnly = false;
        document.getElementById('permisoHasta').readOnly = false;
        document.getElementById('panelSaldoVacaciones').classList.add('d-none');
        document.getElementById('panelCancelacionPedido')?.classList.add('d-none');
        document.getElementById('desgloseCalculoDias').innerHTML = '';
        document.getElementById('infoReglaPermiso').innerText = '';
        state.misSolicitudesGlobal = res.misSolicitudes || [];
        renderMisSolicitudes(state.misSolicitudesGlobal);
      } else {
        msgDiv.className = "alert alert-danger mt-3";
        msgDiv.innerText = res ? res.message : "Error al enviar solicitud.";
      }
    });
  });

  // Subida de comprobante
  document.getElementById('formSubirComprobante').addEventListener('submit', function(e) {
    e.preventDefault();
    const fileInput = document.getElementById('compArchivoInput');
    const file = fileInput.files[0];
    const msgDiv = document.getElementById('compMensaje');
    const btn = document.getElementById('btnSubirArchivo');
    const idTramite = document.getElementById('compHiddenIdTramite').value;

    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      msgDiv.className = "alert alert-danger mt-3";
      msgDiv.innerText = "El archivo supera el límite de 5 MB.";
      msgDiv.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    btn.innerText = "Subiendo archivo a Drive...";
    msgDiv.classList.add('d-none');

    const reader = new FileReader();
    reader.onload = function(evt) {
      const base64String = evt.target.result.split(',')[1];
      callGAS({
        action: 'subirComprobante',
        usuario: state.usuarioActual.usuario,
        clave: state.claveSesionTemporal,
        idTramite: idTramite,
        fileName: file.name,
        mimeType: file.type,
        fileData: base64String
      }, function(res) {
        btn.disabled = false;
        btn.innerText = "Subir Comprobante a la Plataforma";
        msgDiv.classList.remove('d-none');

        if (res && res.success) {
          msgDiv.className = "alert alert-success mt-3";
          msgDiv.innerText = "✓ " + res.message;
          if (res.misSolicitudes) {
            state.misSolicitudesGlobal = res.misSolicitudes;
            renderMisSolicitudes(state.misSolicitudesGlobal);
          }
        } else {
          msgDiv.className = "alert alert-danger mt-3";
          msgDiv.innerText = res ? res.message : "Error al subir el comprobante.";
        }
      });
    };
    reader.readAsDataURL(file);
  });
}
