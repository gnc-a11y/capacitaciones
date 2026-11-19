import { state } from './state.js';
import { callGAS } from './api.js';
import { limpiarCacheNavegador } from './ui.js';
import { renderCapacitaciones } from './capacitaciones.js';
import { inicializarModuloPermisos } from './permisos.js';

let intervaloSincronizacion = null;
let sincronizandoAhora = false;

function aplicarDatosSesionEnPantalla(res, clave, esInicioInicial = false) {
  state.usuarioActual = res;
  state.claveSesionTemporal = clave;

  // Guardar en sessionStorage (propio de cada pestaña: sobrevive a F5 y no mezcla pestañas)
  try {
    sessionStorage.setItem('ceez_sesion_usuario', res.usuario);
    sessionStorage.setItem('ceez_sesion_clave', clave);
  } catch (e) {}

  let etiquetaRol = res.rol;
  if (res.rol === "Jefa_RRHH") etiquetaRol = "Jefa de RRHH";
  else if (res.accesoRRHH) etiquetaRol = "RRHH Habilitado";
  else if (res.esDelegadoJefe) etiquetaRol = "Aprobador Delegado";
  else if (res.rol === "Gerente") etiquetaRol = "Gerencia General";

  const infoBadge = document.getElementById('usuarioInfo');
  if (infoBadge) {
    infoBadge.innerText = `${res.nombre} | ${res.unidad} (${etiquetaRol})`;
    infoBadge.classList.remove('d-none');
  }

  document.getElementById('btnCerrarSesion')?.classList.remove('d-none');
  document.getElementById('btnAbrirCambioClave')?.classList.remove('d-none');
  const ccUser = document.getElementById('ccUsuario');
  if (ccUser) ccUser.value = res.usuario;

  if (res.usaClaveDefecto) {
    document.getElementById('alertaClaveDefecto')?.classList.remove('d-none');
  } else {
    document.getElementById('alertaClaveDefecto')?.classList.add('d-none');
  }

  if (esInicioInicial) {
    document.getElementById('vistaLogin')?.classList.add('d-none');
    document.getElementById('barraNavegacion')?.classList.remove('d-none');
    document.getElementById('vistaVideoIntro')?.classList.remove('d-none');

    let videoUrl = res.urlVideoIntro || "https://www.youtube.com/embed/jPH_Rq-6nBE";
    if (!videoUrl.includes('autoplay=1')) {
      videoUrl += (videoUrl.includes('?') ? '&' : '?') + 'autoplay=1';
    }
    const iframe = document.getElementById('iframeVideoIntro');
    if (iframe) iframe.src = videoUrl;
  }

  renderCapacitaciones(res.capacitaciones);
  inicializarModuloPermisos(res);
}

export function sincronizarSesionSilenciosa() {
  if (!state.usuarioActual || !state.claveSesionTemporal) return;
  if (sincronizandoAhora) return;

  // Solo pausar si hay un modal abierto (ej. rindiendo examen o subiendo archivo)
  if (document.querySelector('.modal.show')) return;

  sincronizandoAhora = true;
  const usuario = state.usuarioActual.usuario;
  const clave = state.claveSesionTemporal;

  callGAS({ action: 'login', usuario: usuario, clave: clave }, function(res) {
    sincronizandoAhora = false;

    if (!state.usuarioActual || state.usuarioActual.usuario !== usuario) return;
    if (document.querySelector('.modal.show')) return;

    if (res && res.success) {
      aplicarDatosSesionEnPantalla(res, clave, false);
    }
  });
}

function iniciarAutoSincronizacion() {
  detenerAutoSincronizacion();
  // Sincroniza automáticamente cada 15 segundos sin necesidad de tocar F5
  intervaloSincronizacion = setInterval(sincronizarSesionSilenciosa, 15000);
}

function detenerAutoSincronizacion() {
  if (intervaloSincronizacion) {
    clearInterval(intervaloSincronizacion);
    intervaloSincronizacion = null;
  }
  sincronizandoAhora = false;
}

document.addEventListener('visibilitychange', function() {
  if (!document.hidden && state.usuarioActual) {
    sincronizarSesionSilenciosa();
  }
});

export function initAuthEvents() {
  // Restaurar sesión automáticamente si el usuario apretó F5 en esta pestaña
  try {
    const usrGuardado = sessionStorage.getItem('ceez_sesion_usuario');
    const claveGuardada = sessionStorage.getItem('ceez_sesion_clave');
    if (usrGuardado && claveGuardada) {
      callGAS({ action: 'login', usuario: usrGuardado, clave: claveGuardada }, function(res) {
        if (res && res.success) {
          aplicarDatosSesionEnPantalla(res, claveGuardada, true);
          iniciarAutoSincronizacion();
        } else {
          sessionStorage.removeItem('ceez_sesion_usuario');
          sessionStorage.removeItem('ceez_sesion_clave');
        }
      });
    }
  } catch (e) {}

  // Login manual
  document.getElementById('formLogin').addEventListener('submit', function(e) {
    e.preventDefault();
    const usuario = document.getElementById('loginUsuario').value.trim();
    const clave = document.getElementById('loginClave').value.trim();
    const btn = document.getElementById('btnIngresar');
    const errDiv = document.getElementById('loginError');

    btn.disabled = true;
    btn.innerText = "Verificando...";
    errDiv.classList.add('d-none');

    callGAS({ action: 'login', usuario: usuario, clave: clave }, function(res) {
      btn.disabled = false;
      btn.innerText = "Ingresar";

      if (res && res.success) {
        document.getElementById('loginClave').value = "";
        aplicarDatosSesionEnPantalla(res, clave, true);
        iniciarAutoSincronizacion();
      } else {
        errDiv.innerText = (res && res.message) ? res.message : "Usuario o clave incorrectos.";
        errDiv.classList.remove('d-none');
      }
    });
  });

  // Cambio de clave
  document.getElementById('formCambiarClave').addEventListener('submit', function(e) {
    e.preventDefault();
    const usuario = document.getElementById('ccUsuario').value.trim();
    const actual = document.getElementById('ccActual').value.trim();
    const nueva = document.getElementById('ccNueva').value.trim();
    const confirmar = document.getElementById('ccConfirmar').value.trim();
    const msgDiv = document.getElementById('ccMensaje');
    const btn = document.getElementById('btnGuardarClave');

    msgDiv.classList.add('d-none');
    if (nueva !== confirmar) {
      msgDiv.className = "alert alert-danger mt-3";
      msgDiv.innerText = "La nueva clave y su confirmación no coinciden.";
      msgDiv.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    btn.innerText = "Guardando...";

    callGAS({ action: 'cambiarClave', usuario: usuario, claveActual: actual, claveNueva: nueva }, function(res) {
      btn.disabled = false;
      btn.innerText = "Actualizar Contraseña";
      msgDiv.classList.remove('d-none');

      if (res && res.success) {
        msgDiv.className = "alert alert-success mt-3";
        msgDiv.innerText = res.message;
        state.claveSesionTemporal = nueva;
        try { sessionStorage.setItem('ceez_sesion_clave', nueva); } catch (e) {}
        document.getElementById('alertaClaveDefecto').classList.add('d-none');
        document.getElementById('formCambiarClave').reset();
        if (state.usuarioActual) document.getElementById('ccUsuario').value = state.usuarioActual.usuario;
      } else {
        msgDiv.className = "alert alert-danger mt-3";
        msgDiv.innerText = res ? res.message : "Error al actualizar.";
      }
    });
  });

  // Cerrar sesión
  document.getElementById('btnCerrarSesion').addEventListener('click', async function() {
    detenerAutoSincronizacion();
    try {
      sessionStorage.removeItem('ceez_sesion_usuario');
      sessionStorage.removeItem('ceez_sesion_clave');
    } catch (e) {}

    await limpiarCacheNavegador();
    state.usuarioActual = null;
    state.claveSesionTemporal = "";
    document.getElementById('iframeVideoIntro').src = "";
    document.getElementById('formLogin').reset();

    const infoBadge = document.getElementById('usuarioInfo');
    infoBadge.innerText = '';
    infoBadge.classList.add('d-none');

    document.getElementById('btnCerrarSesion').classList.add('d-none');
    document.getElementById('btnAbrirCambioClave').classList.add('d-none');
    document.getElementById('barraNavegacion').classList.add('d-none');
    document.getElementById('vistaVideoIntro').classList.add('d-none');
    document.getElementById('vistaCapacitaciones').classList.add('d-none');
    document.getElementById('vistaPermisos').classList.add('d-none');
    document.getElementById('vistaLogin').classList.remove('d-none');
  });
}
