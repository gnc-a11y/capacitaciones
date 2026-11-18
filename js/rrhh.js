import { state } from './state.js';
import { callGAS } from './api.js';

export function renderPanelDelegacionRRHH(operarios) {
  const cont = document.getElementById('listaOperariosDelegacionRRHH');
  if (!operarios.length) {
    cont.innerHTML = '<p class="text-muted small mb-0">No hay operarios cargados en la unidad RRHH.</p>';
    return;
  }
  cont.innerHTML = '';
  operarios.forEach(op => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2';
    item.innerHTML = `
      <div>
        <strong class="small">${op.nombre}</strong> <span class="text-muted small">(Leg. ${op.legajo})</span><br>
        <span class="badge ${op.accesoRRHH ? 'bg-success' : 'bg-secondary'}">
          ${op.accesoRRHH ? '✓ Acceso Completo Habilitado' : '🔒 Bloqueado'}
        </span>
      </div>
      <div>
        ${op.accesoRRHH
          ? `<button class="btn btn-outline-danger btn-sm fw-bold btn-toggle-rrhh" data-usr="${op.usuario}" data-hab="false">🚫 Bloquear</button>`
          : `<button class="btn btn-success btn-sm fw-bold btn-toggle-rrhh" data-usr="${op.usuario}" data-hab="true">✓ Habilitar</button>`
        }
      </div>`;
    cont.appendChild(item);
  });

  cont.querySelectorAll('.btn-toggle-rrhh').forEach(btn => {
    btn.addEventListener('click', () => {
      cambiarDelegacionRRHH(btn.dataset.usr, btn.dataset.hab === 'true');
    });
  });
}

function cambiarDelegacionRRHH(usuarioOperario, habilitar) {
  callGAS({
    action: 'toggleDelegacionRRHH',
    usuario: state.usuarioActual.usuario,
    clave: state.claveSesionTemporal,
    usuarioOperario: usuarioOperario,
    habilitar: habilitar
  }, function(res) {
    if (res && res.success) {
      renderPanelDelegacionRRHH(res.operariosDelegacion || []);
      alert(res.message);
    } else {
      alert(res ? res.message : "Error al cambiar permiso.");
    }
  });
}

export function poblarSelectorVacacionesRRHH() {
  const sel = document.getElementById('rrhhSelectEmpleado');
  const prev = sel.value;
  sel.innerHTML = '';
  state.empleadosRRHHGlobal.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.legajo;
    opt.innerText = `${e.nombre} (${e.unidad} - ${e.modalidadDias}) | Saldo: ${e.diasVacaciones}d`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
  cargarSaldoEmpleadoSeleccionado();
}

function cargarSaldoEmpleadoSeleccionado() {
  const leg = document.getElementById('rrhhSelectEmpleado').value;
  const emp = state.empleadosRRHHGlobal.find(e => e.legajo === leg);
  if (emp) document.getElementById('rrhhInputDias').value = emp.diasVacaciones;
}

function guardarSaldoVacacionesRRHH() {
  const leg = document.getElementById('rrhhSelectEmpleado').value;
  const nuevosDias = document.getElementById('rrhhInputDias').value;
  const btn = document.getElementById('btnGuardarSaldoRRHH');
  btn.disabled = true;

  callGAS({
    action: 'actualizarSaldoVacaciones',
    usuario: state.usuarioActual.usuario,
    clave: state.claveSesionTemporal,
    legajoEmpleado: leg,
    nuevosDias: nuevosDias
  }, function(res) {
    btn.disabled = false;
    if (res && res.success) {
      state.empleadosRRHHGlobal = res.empleadosRRHHAdmin || state.empleadosRRHHGlobal;
      poblarSelectorVacacionesRRHH();
      const msg = document.getElementById('rrhhMsgSaldo');
      msg.innerText = "✓ " + res.message;
      msg.classList.remove('d-none');
      setTimeout(() => msg.classList.add('d-none'), 3000);
    } else {
      alert(res ? res.message : "Error al guardar saldo.");
    }
  });
}

export function renderFeriadosRRHH() {
  const cont = document.getElementById('listaFeriadosChips');
  cont.innerHTML = '';
  state.feriadosGlobal.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(f => {
    const span = document.createElement('span');
    span.className = 'badge bg-light text-dark border p-2';
    span.innerHTML = `${f.fecha} (${f.desc}) <a href="#" class="text-danger text-decoration-none ms-1 btn-del-feriado" data-fecha="${f.fecha}">✕</a>`;
    cont.appendChild(span);
  });

  cont.querySelectorAll('.btn-del-feriado').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      eliminarFeriadoRRHH(link.dataset.fecha);
    });
  });
}

function agregarFeriadoRRHH() {
  const fecha = document.getElementById('nuevoFeriadoFecha').value;
  const desc = document.getElementById('nuevoFeriadoDesc').value.trim() || "Feriado";
  if (!fecha) return;

  callGAS({
    action: 'gestionarFeriado',
    subAction: 'agregar',
    usuario: state.usuarioActual.usuario,
    clave: state.claveSesionTemporal,
    fecha: fecha,
    descripcion: desc
  }, function(res) {
    if (res && res.success) {
      state.feriadosGlobal = res.feriados || [];
      renderFeriadosRRHH();
      document.getElementById('nuevoFeriadoFecha').value = '';
      document.getElementById('nuevoFeriadoDesc').value = '';
    }
  });
}

function eliminarFeriadoRRHH(fecha) {
  callGAS({
    action: 'gestionarFeriado',
    subAction: 'eliminar',
    usuario: state.usuarioActual.usuario,
    clave: state.claveSesionTemporal,
    fecha: fecha
  }, function(res) {
    if (res && res.success) {
      state.feriadosGlobal = res.feriados || [];
      renderFeriadosRRHH();
    }
  });
}

export function initRRHHEvents() {
  document.getElementById('rrhhSelectEmpleado').addEventListener('change', cargarSaldoEmpleadoSeleccionado);
  document.getElementById('btnGuardarSaldoRRHH').addEventListener('click', guardarSaldoVacacionesRRHH);
  document.getElementById('btnAgregarFeriado').addEventListener('click', agregarFeriadoRRHH);
}
