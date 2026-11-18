import { state } from './state.js';
import { callGAS } from './api.js';
import { limpiarCacheNavegador } from './ui.js';
import { renderCapacitaciones } from './capacitaciones.js';
import { inicializarModuloPermisos } from './permisos.js';

export function initAuthEvents() {
  // Login
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
        state.usuarioActual = res;
        state.claveSesionTemporal = clave;
        document.getElementById('loginClave').value = "";

        let etiquetaRol = res.rol;
        if (res.rol === "Jefa_RRHH") etiquetaRol = "Jefa de RRHH";
        else if (res.accesoRRHH) etiquetaRol = "RRHH Habilitado";
        else if (res.esDelegadoJefe) etiquetaRol = "Aprobador Delegado";
        else if (res.rol === "Gerente") etiquetaRol = "Gerencia General";

        const infoBadge = document.getElementById('usuarioInfo');
        infoBadge.innerText = `${res.nombre} | ${res.unidad} (${etiquetaRol})`;
        infoBadge.classList.remove('d-none');

        document.getElementById('btnCerrarSesion').classList.remove('d-none');
        document.getElementById('btnAbrirCambioClave').classList.remove('d-none');
        document.getElementById('ccUsuario').value = res.usuario;

        if (res.usaClaveDefecto) {
          document.getElementById('alertaClaveDefecto').classList.remove('d-none');
        } else {
          document.getElementById('alertaClaveDefecto').classList.add('d-none');
        }

        document.getElementById('vistaLogin').classList.add('d-none');
        document.getElementById('barraNavegacion').classList.remove('d-none');
        document.getElementById('vistaVideoIntro').classList.remove('d-none');

        let videoUrl = res.urlVideoIntro || "https://www.youtube.com/embed/jPH_Rq-6nBE";
        if (!videoUrl.includes('autoplay=1')) {
          videoUrl += (videoUrl.includes('?') ? '&' : '?') + 'autoplay=1';
        }
        document.getElementById('iframeVideoIntro').src = videoUrl;

        renderCapacitaciones(res.capacitaciones);
        inicializarModuloPermisos(res);
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
