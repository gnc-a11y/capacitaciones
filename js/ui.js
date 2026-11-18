export async function limpiarCacheNavegador() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (err) {}
}

export function cambiarPestana(pestana) {
  document.getElementById('iframeVideoIntro').src = "";
  document.getElementById('vistaVideoIntro').classList.add('d-none');

  if (pestana === 'capacitaciones') {
    document.getElementById('tabCapacitaciones').classList.add('active');
    document.getElementById('tabPermisos').classList.remove('active');
    document.getElementById('vistaPermisos').classList.add('d-none');
    document.getElementById('vistaCapacitaciones').classList.remove('d-none');
  } else {
    document.getElementById('tabPermisos').classList.add('active');
    document.getElementById('tabCapacitaciones').classList.remove('active');
    document.getElementById('vistaCapacitaciones').classList.add('d-none');
    document.getElementById('vistaPermisos').classList.remove('d-none');
  }
}

export function cambiarSubPestana(tab) {
  ['subTabPersonal', 'subTabJefatura', 'subTabRRHH', 'subTabHistorialGlobal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  ['vistaSubPersonal', 'vistaSubJefatura', 'vistaSubRRHH', 'vistaSubHistorial'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('d-none');
  });

  if (tab === 'personal') {
    document.getElementById('subTabPersonal').classList.add('active');
    document.getElementById('vistaSubPersonal').classList.remove('d-none');
  } else if (tab === 'jefatura') {
    document.getElementById('subTabJefatura').classList.add('active');
    document.getElementById('vistaSubJefatura').classList.remove('d-none');
  } else if (tab === 'rrhh') {
    document.getElementById('subTabRRHH').classList.add('active');
    document.getElementById('vistaSubRRHH').classList.remove('d-none');
  } else if (tab === 'historial') {
    document.getElementById('subTabHistorialGlobal').classList.add('active');
    document.getElementById('vistaSubHistorial').classList.remove('d-none');
  }
}

export function initUIEvents() {
  document.getElementById('tabCapacitaciones').addEventListener('click', () => cambiarPestana('capacitaciones'));
  document.getElementById('tabPermisos').addEventListener('click', () => cambiarPestana('permisos'));
  document.getElementById('btnContinuarCapacitaciones').addEventListener('click', () => cambiarPestana('capacitaciones'));

  document.getElementById('subTabPersonal').addEventListener('click', () => cambiarSubPestana('personal'));
  document.getElementById('subTabJefatura').addEventListener('click', () => cambiarSubPestana('jefatura'));
  document.getElementById('subTabRRHH').addEventListener('click', () => cambiarSubPestana('rrhh'));
  document.getElementById('subTabHistorialGlobal').addEventListener('click', () => cambiarSubPestana('historial'));
}
