import { limpiarCacheNavegador, initUIEvents } from './ui.js';
import { initAuthEvents } from './auth.js';
import { initCapacitacionesEvents } from './capacitaciones.js';
import { initPermisosEvents } from './permisos.js';
import { initRRHHEvents } from './rrhh.js';
import { initCambioTurno } from './cambio-turno.js';

window.addEventListener('DOMContentLoaded', async () => {
  await limpiarCacheNavegador();
  initUIEvents();
  initAuthEvents();
  initCapacitacionesEvents();
  initPermisosEvents();
  initRRHHEvents();
  initCambioTurno();
});
