export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value), window.location.href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch (err) {
    return null;
  }
}

export function youtubeEmbedUrl(value) {
  const safeUrl = safeExternalUrl(value);
  if (!safeUrl) return null;

  const url = new URL(safeUrl);
  let videoId = '';
  if (url.hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') || '';
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
      videoId = match ? match[1] : '';
    }
  }

  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  embedUrl.searchParams.set('autoplay', '1');
  return embedUrl.href;
}

export async function limpiarCacheNavegador(borrarSesion = false) {
  try {
    if (borrarSesion) {
      ['ceez_sesion_usuario', 'ceez_sesion_token', 'ceez_sesion_clave'].forEach(key => {
        sessionStorage.removeItem(key);
      });
    }
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
  ['subTabPersonal', 'subTabJefatura', 'subTabRRHH', 'subTabHistorialGlobal', 'subTabNotasSector'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  ['vistaSubPersonal', 'vistaSubJefatura', 'vistaSubRRHH', 'vistaSubHistorial', 'vistaSubNotasSector'].forEach(id => {
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
  } else if (tab === 'notasSector') {
    document.getElementById('subTabNotasSector').classList.add('active');
    document.getElementById('vistaSubNotasSector').classList.remove('d-none');
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
  document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-pass');
      const input = document.getElementById(targetId);
      if (!input) return;
      const estaOculto = input.type === 'password';
      input.type = estaOculto ? 'text' : 'password';
      btn.textContent = estaOculto ? '🙈' : '👁️';
    });
  });
}
