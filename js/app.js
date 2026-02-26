/**
 * app.js — Lógica principal y gestión de vistas
 * Secuestros Informáticos PWA
 */

/* =============================================
   CONSTANTES
   ============================================= */
const UBICACIONES = [
  { id: 'Base', color: '#5b73e8' },
  { id: 'Fiscalia', color: '#e85b9a' },
  { id: 'Daic', color: '#f0a500' },
  { id: 'Dipi', color: '#3dd68c' },
  { id: 'Sala de Efectos', color: '#e85b5b' },
  { id: 'Constataciones', color: '#c084fc' },
];

const MAX_FOTOS = 8;
const MAX_FOTO_PX = 1200;  // reducir antes de guardar
const FOTO_QUALITY = 0.75;

/* =============================================
   ESTADO GLOBAL
   ============================================= */
let state = {
  vistaActual: 'lista',
  filtroUbicacion: '',
  terminoBusqueda: '',
  secuestroActualId: null,
  scannerActivo: false,
  codigoEscaneado: '',
  // medios pendientes en formulario nuevo (antes de guardar)
  fotasPendientes: [],   // [{dataUrl, nombre}]
  pdfsPendientes: [],    // [{dataUrl, nombre}]
};

/* =============================================
   UTILIDADES UI
   ============================================= */
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function toast(msg, tipo = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${tipo}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, 3200);
}

function formatFecha(fecha) {
  if (!fecha) return null;
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function colorUbicacion(ub) {
  return UBICACIONES.find(u => u.id === ub)?.color || '#5b73e8';
}

/* =============================================
   COMPRESIÓN DE IMÁGENES
   ============================================= */
function comprimirImagen(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > MAX_FOTO_PX || h > MAX_FOTO_PX) {
          if (w > h) { h = Math.round(h * MAX_FOTO_PX / w); w = MAX_FOTO_PX; }
          else { w = Math.round(w * MAX_FOTO_PX / h); h = MAX_FOTO_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', FOTO_QUALITY), nombre: file.name });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* =============================================
   NAVEGACIÓN
   ============================================= */
function mostrarVista(vista) {
  if (state.scannerActivo && vista !== 'nuevo') {
    Scanner.detener();
    state.scannerActivo = false;
  }
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${vista}`).classList.add('active');

  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  if (vista === 'lista') $('#nav-lista').classList.add('active');

  const topbarTitle = $('#topbar-title');
  const topbarBack = $('#topbar-back');

  if (vista === 'lista') {
    topbarTitle.innerHTML = '🔒 <span>Secuestros</span>';
    topbarBack.style.display = 'none';
    renderStats();
  } else if (vista === 'nuevo') {
    topbarTitle.innerHTML = '📷 <span>Nuevo Secuestro</span>';
    topbarBack.style.display = 'flex';
  } else if (vista === 'detalle') {
    const s = DB.getById(state.secuestroActualId);
    const titulo = s?.titulo || 'Secuestro';
    topbarTitle.innerHTML = `📋 <span>${titulo.length > 20 ? titulo.slice(0, 20) + '…' : titulo}</span>`;
    topbarBack.style.display = 'flex';
  }
  state.vistaActual = vista;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =============================================
   VISTA LISTA
   ============================================= */
function renderLista() {
  let datos;
  if (state.terminoBusqueda) {
    datos = DB.buscar(state.terminoBusqueda);
    if (state.filtroUbicacion) datos = datos.filter(s => s.ubicacion === state.filtroUbicacion);
  } else {
    datos = state.filtroUbicacion ? DB.filtrarPorUbicacion(state.filtroUbicacion) : DB.getAll();
  }

  const lista = $('#card-list');
  if (datos.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <h3>${state.terminoBusqueda || state.filtroUbicacion ? 'Sin resultados' : 'Sin secuestros'}</h3>
        <p>${state.terminoBusqueda || state.filtroUbicacion
        ? 'No se encontraron secuestros con ese criterio.'
        : 'Tocá el botón + para registrar el primer secuestro.'}</p>
      </div>`;
    return;
  }

  lista.innerHTML = datos.map(s => {
    const color = colorUbicacion(s.ubicacion);
    const egresoTag = s.fechaEgreso
      ? `<div class="egreso-badge">✓ Egresado: ${formatFecha(s.fechaEgreso)}</div>`
      : `<div class="egreso-badge sin-egreso">En custodia</div>`;
    const mediaTag = (s.mediaIds?.length)
      ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px">📎 ${s.mediaIds.length} archivo${s.mediaIds.length > 1 ? 's' : ''}</div>`
      : '';
    return `
      <div class="secuestro-card" style="--loc-color:${color}" data-id="${s.id}" onclick="abrirDetalle('${s.id}')">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(s.titulo)}</div>
            <div class="card-code">${escapeHtml(s.codigoBarras || '—')}</div>
          </div>
          <span class="loc-badge" style="--loc-color:${color}">${escapeHtml(s.ubicacion)}</span>
        </div>
        <div class="card-dates">
          <div class="date-item">
            <span class="date-label">Ingreso</span>
            <span>${formatFecha(s.fechaIngreso) || '—'}</span>
          </div>
        </div>
        ${egresoTag}
        ${mediaTag}
      </div>`;
  }).join('');
}

function renderStats() {
  const s = DB.stats();
  $('#stat-total').textContent = s.total;
  $('#stat-activos').textContent = s.activos;
  $('#stat-egresados').textContent = s.egresados;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =============================================
   FILTROS Y BÚSQUEDA
   ============================================= */
function inicializarFiltros() {
  $('#searchInput').addEventListener('input', e => {
    state.terminoBusqueda = e.target.value;
    renderLista();
  });
  $$('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.filter-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filtroUbicacion = chip.dataset.loc || '';
      renderLista();
    });
  });
}

/* =============================================
   FORMULARIO NUEVO — FOTOS
   ============================================= */
function renderFotosPendientes() {
  const grid = $('#fotos-grid-nuevo');
  if (!grid) return;
  grid.innerHTML = '';

  state.fotasPendientes.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `<img src="${f.dataUrl}" alt="Foto ${idx + 1}" onclick="abrirLightbox('${f.dataUrl}')">
      <button class="photo-del" onclick="eliminarFotoPendiente(${idx})" title="Eliminar">✕</button>`;
    grid.appendChild(div);
  });

  // Botón agregar (si hay lugar)
  if (state.fotasPendientes.length < MAX_FOTOS) {
    const label = document.createElement('label');
    label.className = 'photo-add-btn';
    label.title = 'Tomar o seleccionar foto';
    label.innerHTML = `📷<input type="file" accept="image/*" capture="environment" id="foto-input-nuevo">`;
    label.querySelector('input').addEventListener('change', onFotoSeleccionada);
    grid.appendChild(label);
  }

  const note = $('#fotos-count-nuevo');
  if (note) note.textContent = `${state.fotasPendientes.length}/${MAX_FOTOS} fotos`;
}

async function onFotoSeleccionada(e) {
  const files = [...e.target.files];
  for (const file of files) {
    if (state.fotasPendientes.length >= MAX_FOTOS) break;
    const comprimida = await comprimirImagen(file);
    state.fotasPendientes.push(comprimida);
  }
  e.target.value = '';
  renderFotosPendientes();
}

function eliminarFotoPendiente(idx) {
  state.fotasPendientes.splice(idx, 1);
  renderFotosPendientes();
}

/* =============================================
   FORMULARIO NUEVO — PDFs (Constataciones)
   ============================================= */
function renderPdfsPendientes() {
  const listEl = $('#pdfs-list-nuevo');
  if (!listEl) return;
  listEl.innerHTML = state.pdfsPendientes.map((p, idx) => `
    <div class="pdf-item">
      <span class="pdf-icon">📄</span>
      <span class="pdf-name">${escapeHtml(p.nombre)}</span>
      <button class="pdf-view" onclick="verPdfPendiente(${idx})">Ver</button>
      <button class="pdf-del" onclick="eliminarPdfPendiente(${idx})" title="Quitar">✕</button>
    </div>`).join('');
}

async function onPdfSeleccionado(e) {
  const files = [...e.target.files];
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { toast('⚠️ El PDF supera 20 MB', 'error'); continue; }
    const dataUrl = await leerComoDataUrl(file);
    state.pdfsPendientes.push({ dataUrl, nombre: file.name });
  }
  e.target.value = '';
  renderPdfsPendientes();
}

function leerComoDataUrl(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.readAsDataURL(file);
  });
}

function eliminarPdfPendiente(idx) {
  state.pdfsPendientes.splice(idx, 1);
  renderPdfsPendientes();
}

function verPdfPendiente(idx) {
  const p = state.pdfsPendientes[idx];
  if (!p) return;
  const w = window.open();
  w.document.write(`<iframe src="${p.dataUrl}" style="width:100%;height:100vh;border:none"></iframe>`);
}

/* =============================================
   FORMULARIO NUEVO — CONSTATACIONES TOGGLE
   ============================================= */
function manejarCambioUbicacion(containerSel) {
  const checked = document.querySelector(`${containerSel} input[type="radio"]:checked`);
  const secConst = $('#constataciones-section-nuevo');
  if (!secConst) return;
  if (checked?.value === 'Constataciones') {
    secConst.classList.add('visible');
  } else {
    secConst.classList.remove('visible');
  }
}

/* =============================================
   VISTA NUEVA — INICIALIZAR FORM
   ============================================= */
function inicializarFormNuevo() {
  // Scanner
  $('#btn-iniciar-scanner').addEventListener('click', async () => {
    $('#reader').innerHTML = '';
    $('#scanned-result').classList.remove('visible');
    state.codigoEscaneado = '';
    $('#codigoBarras').value = '';
    $('#btn-iniciar-scanner').disabled = true;
    $('#btn-iniciar-scanner').textContent = '⏳ Iniciando…';

    const ok = await Scanner.iniciar((codigo) => {
      state.codigoEscaneado = codigo;
      state.scannerActivo = false;
      $('#codigoBarras').value = codigo;
      $('#scanned-code-text').textContent = codigo;
      $('#scanned-result').classList.add('visible');
      $('#reader').innerHTML = '';
      toast('✅ Código escaneado', 'success');
      actualizarBtnScanner(false);
    });
    if (ok) { state.scannerActivo = true; actualizarBtnScanner(true); }
    else { toast('❌ No se pudo acceder a la cámara. Ingresá el código manualmente.', 'error'); actualizarBtnScanner(false); }
  });

  $('#btn-detener-scanner').addEventListener('click', async () => {
    await Scanner.detener();
    state.scannerActivo = false;
    $('#reader').innerHTML = '';
    actualizarBtnScanner(false);
  });

  // Guardar
  $('#form-nuevo').addEventListener('submit', e => { e.preventDefault(); guardarNuevo(); });

  // Location grid
  crearLocationGrid('#location-grid-nuevo', 'ubicacion-nuevo', 'Base', () => {
    manejarCambioUbicacion('#location-grid-nuevo');
  });

  // PDF input
  $('#pdf-input-nuevo').addEventListener('change', onPdfSeleccionado);

  // Render inicial medios (delayed to ensure view is active)
  setTimeout(() => { renderFotosPendientes(); renderPdfsPendientes(); }, 50);
}

function actualizarBtnScanner(activo) {
  const btnI = $('#btn-iniciar-scanner');
  const btnD = $('#btn-detener-scanner');
  btnI.disabled = activo;
  btnI.textContent = activo ? '📷 Escaneando…' : '📷 Iniciar Cámara';
  btnD.style.display = activo ? 'flex' : 'none';
}

async function guardarNuevo() {
  const titulo = $('#titulo-nuevo').value.trim();
  const codigoBarras = $('#codigoBarras').value.trim();
  const fechaIngreso = $('#fechaIngreso').value;
  const fechaEgreso = $('#fechaEgreso-nuevo').value || null;
  const ubicacion = document.querySelector('input[name="ubicacion-nuevo"]:checked')?.value || 'Base';
  const informacion = $('#informacion-nuevo').value.trim();

  if (!titulo) { toast('Por favor ingresá un título.', 'error'); return; }
  if (!fechaIngreso) { toast('Por favor ingresá la fecha de ingreso.', 'error'); return; }

  const nuevo = DB.crear({ codigoBarras, titulo, fechaIngreso, fechaEgreso, ubicacion, informacion });

  // Guardar fotos en IndexedDB
  const mediaIds = [];
  for (const f of state.fotasPendientes) {
    const id = await DB.guardarMedia(nuevo.id, 'foto', f.dataUrl, f.nombre);
    mediaIds.push(id);
  }
  // Guardar PDFs en IndexedDB
  for (const p of state.pdfsPendientes) {
    const id = await DB.guardarMedia(nuevo.id, 'pdf', p.dataUrl, p.nombre);
    mediaIds.push(id);
  }
  // Actualizar secuestro con mediaIds
  if (mediaIds.length > 0) DB.actualizar(nuevo.id, { mediaIds });

  toast(`✅ Secuestro "${nuevo.titulo}" guardado`, 'success');

  // Reset
  $('#form-nuevo').reset();
  $('#scanned-result').classList.remove('visible');
  $('#reader').innerHTML = '';
  state.codigoEscaneado = '';
  state.scannerActivo = false;
  state.fotasPendientes = [];
  state.pdfsPendientes = [];
  actualizarBtnScanner(false);

  const baseOpt = document.querySelector('#location-grid-nuevo .loc-option[data-loc="Base"]');
  if (baseOpt) seleccionarUbicacion(baseOpt, '#location-grid-nuevo', 'ubicacion-nuevo');
  $('#constataciones-section-nuevo').classList.remove('visible');

  renderFotosPendientes();
  renderPdfsPendientes();
  renderLista();
  renderStats();
  mostrarVista('lista');
}

/* =============================================
   LOCATION GRID
   ============================================= */
function crearLocationGrid(containerSel, radioName, defaultLoc, onChange) {
  const container = $(containerSel);
  container.innerHTML = UBICACIONES.map(u => `
    <label class="loc-option${u.id === defaultLoc ? ' selected' : ''}" data-loc="${u.id}">
      <input type="radio" name="${radioName}" value="${u.id}" ${u.id === defaultLoc ? 'checked' : ''}>
      <span class="loc-dot" style="background:${u.color}"></span>
      <span>${u.id}</span>
    </label>
  `).join('');

  $$(`${containerSel} .loc-option`).forEach(opt => {
    opt.addEventListener('click', () => {
      seleccionarUbicacion(opt, containerSel, radioName);
      if (onChange) onChange();
    });
  });
}

function seleccionarUbicacion(opt, containerSel, radioName) {
  $$(containerSel + ' .loc-option').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
  const radio = opt.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
}

/* =============================================
   LIGHTBOX (fotos)
   ============================================= */
function abrirLightbox(src) {
  const lb = $('#lightbox');
  $('#lightbox-img').src = src;
  lb.classList.add('open');
}
function cerrarLightbox() { $('#lightbox').classList.remove('open'); }

/* =============================================
   VISTA DETALLE / EDICIÓN
   ============================================= */
function abrirDetalle(id) {
  state.secuestroActualId = id;
  renderDetalle(id);
  mostrarVista('detalle');
}

async function renderDetalle(id) {
  const s = DB.getById(id);
  if (!s) { mostrarVista('lista'); return; }

  const color = colorUbicacion(s.ubicacion);
  const medios = await DB.getMediaDeSecuestro(id);
  const fotos = medios.filter(m => m.tipo === 'foto');
  const pdfs = medios.filter(m => m.tipo === 'pdf');

  const container = $('#view-detalle');

  const fotosHtml = fotos.length ? `
    <div class="detail-field">
      <div class="df-icon">🖼️</div>
      <div class="df-content">
        <div class="df-label">Fotos (${fotos.length})</div>
        <div class="detail-photo-grid">
          ${fotos.map(f => `<img src="${f.dataUrl}" alt="${escapeHtml(f.nombre)}" onclick="abrirLightbox('${f.dataUrl}')">`).join('')}
        </div>
      </div>
    </div>` : '';

  const pdfsHtml = pdfs.length ? `
    <div class="detail-field">
      <div class="df-icon">📄</div>
      <div class="df-content">
        <div class="df-label">PDFs (${pdfs.length})</div>
        <div class="detail-pdf-list">
          ${pdfs.map(p => `
            <div class="pdf-item">
              <span class="pdf-icon">📄</span>
              <span class="pdf-name">${escapeHtml(p.nombre)}</span>
              <button class="pdf-view" onclick="verPdfMedia('${p.id}')">Ver</button>
            </div>`).join('')}
        </div>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="form-section" style="border-left: 4px solid ${color}">
      <div class="detail-field">
        <div class="df-icon">🔻</div>
        <div class="df-content">
          <div class="df-label">Código de Barras</div>
          <div class="df-value code">${escapeHtml(s.codigoBarras || '—')}</div>
        </div>
      </div>
      <div class="detail-field">
        <div class="df-icon">📋</div>
        <div class="df-content">
          <div class="df-label">Título</div>
          <div class="df-value">${escapeHtml(s.titulo)}</div>
        </div>
      </div>
      <div class="detail-field">
        <div class="df-icon">📅</div>
        <div class="df-content">
          <div class="df-label">Fecha de Ingreso</div>
          <div class="df-value">${formatFecha(s.fechaIngreso) || '—'}</div>
        </div>
      </div>
      <div class="detail-field">
        <div class="df-icon">🚪</div>
        <div class="df-content">
          <div class="df-label">Fecha de Egreso</div>
          <div class="df-value ${s.fechaEgreso ? '' : 'muted'}">${s.fechaEgreso ? formatFecha(s.fechaEgreso) : 'Sin egreso registrado'}</div>
        </div>
      </div>
      <div class="detail-field">
        <div class="df-icon">📍</div>
        <div class="df-content">
          <div class="df-label">Ubicación</div>
          <div class="df-value"><span class="loc-badge" style="--loc-color:${color}">${escapeHtml(s.ubicacion)}</span></div>
        </div>
      </div>
      ${s.informacion ? `
      <div class="detail-field">
        <div class="df-icon">📝</div>
        <div class="df-content">
          <div class="df-label">Información</div>
          <div class="df-value">${escapeHtml(s.informacion).replace(/\n/g, '<br>')}</div>
        </div>
      </div>` : ''}
      ${fotosHtml}
      ${pdfsHtml}
    </div>

    <!-- EDICIÓN -->
    <div class="form-section" id="edit-section">
      <h2>✏️ Editar</h2>

      <div class="form-group">
        <label for="edit-codigo">Código de Barras</label>
        <input type="text" id="edit-codigo" value="${escapeHtml(s.codigoBarras)}" placeholder="Escanear o ingresar manualmente">
      </div>

      <div class="form-group">
        <label for="edit-titulo">Título *</label>
        <input type="text" id="edit-titulo" value="${escapeHtml(s.titulo)}">
      </div>

      <div class="form-group">
        <label for="edit-ingreso">Fecha de Ingreso</label>
        <input type="date" id="edit-ingreso" value="${s.fechaIngreso || ''}">
      </div>

      <div class="form-group">
        <label for="edit-egreso">Fecha de Egreso</label>
        <input type="date" id="edit-egreso" value="${s.fechaEgreso || ''}">
      </div>

      <div class="form-group">
        <label>Ubicación</label>
        <div class="location-grid" id="location-grid-edit"></div>
      </div>

      <div class="form-group">
        <label for="edit-info">Información adicional</label>
        <textarea id="edit-info">${escapeHtml(s.informacion)}</textarea>
      </div>

      <!-- Fotos edición -->
      <div class="form-group">
        <label>Fotos</label>
        <div class="photo-section">
          <div class="photo-grid" id="fotos-grid-edit"></div>
          <div class="photo-count-note" id="fotos-count-edit"></div>
        </div>
      </div>

      <!-- PDFs edición (Constataciones) -->
      <div class="form-group constataciones-section" id="constataciones-section-edit">
        <label>📁 PDFs — Constataciones</label>
        <div class="pdf-section">
          <div class="pdf-list" id="pdfs-list-edit"></div>
          <label class="pdf-add-btn">
            📎 Adjuntar PDF
            <input type="file" accept="application/pdf" multiple id="pdf-input-edit">
          </label>
        </div>
      </div>

      <div class="btn-actions">
        <button class="btn btn-primary" onclick="guardarEdicion()">💾 Guardar</button>
        <button class="btn btn-danger btn-sm" onclick="confirmarEliminar()">🗑️</button>
      </div>
    </div>
  `;

  // Scanner en edición (inline)
  const codigoGroup = container.querySelector('#edit-codigo').closest('.form-group');
  const scannerDiv = document.createElement('div');
  scannerDiv.className = 'form-group';
  scannerDiv.innerHTML = `
    <div class="scanner-section" style="margin-bottom:0">
      <p style="margin-bottom:10px;font-size:0.82rem;color:var(--text-muted)">Escanear nuevo código</p>
      <div id="reader-edit"></div>
      <div class="scanner-actions">
        <button class="btn btn-secondary btn-sm" id="btn-scan-edit">📷 Escanear</button>
        <button class="btn btn-secondary btn-sm" id="btn-stop-edit" style="display:none">⏹ Detener</button>
      </div>
      <div class="scanned-result" id="scanned-result-edit">
        <span class="scan-ok">✅</span>
        <span class="scan-code" id="scanned-code-edit"></span>
      </div>
    </div>`;
  codigoGroup.after(scannerDiv);

  $('#btn-scan-edit').addEventListener('click', async () => {
    $('#reader-edit').innerHTML = '';
    const ok = await Scanner.iniciar(codigo => {
      $('#edit-codigo').value = codigo;
      $('#scanned-code-edit').textContent = codigo;
      $('#scanned-result-edit').classList.add('visible');
      $('#reader-edit').innerHTML = '';
      $('#btn-scan-edit').disabled = false;
      $('#btn-scan-edit').textContent = '📷 Escanear';
      $('#btn-stop-edit').style.display = 'none';
      toast('✅ Código escaneado', 'success');
    });
    if (ok) { $('#btn-scan-edit').disabled = true; $('#btn-scan-edit').textContent = '📷 Escaneando…'; $('#btn-stop-edit').style.display = 'flex'; }
    else { toast('❌ No se pudo acceder a la cámara.', 'error'); }
  });
  $('#btn-stop-edit').addEventListener('click', async () => {
    await Scanner.detener();
    $('#reader-edit').innerHTML = '';
    $('#btn-scan-edit').disabled = false;
    $('#btn-scan-edit').textContent = '📷 Escanear';
    $('#btn-stop-edit').style.display = 'none';
  });

  // Location grid edición
  crearLocationGrid('#location-grid-edit', 'ubicacion-edit', s.ubicacion, () => {
    manejarCambioUbicacionEdit();
  });

  // Mostrar sección PDFs si ubicacion es Constataciones
  if (s.ubicacion === 'Constataciones') $('#constataciones-section-edit').classList.add('visible');

  // Fotos edición (fotos ya guardadas + nuevas)
  state._editFotasPendientes = [];  // nuevas fotos a agregar
  state._editFotasExistentes = fotos.map(f => ({ ...f }));
  state._editPdfsPendientes = [];
  state._editPdfsExistentes = pdfs.map(p => ({ ...p }));
  state._editFotasEliminar = [];
  state._editPdfsEliminar = [];

  renderFotasEdit();
  renderPdfsEdit();

  $('#pdf-input-edit').addEventListener('change', async e => {
    for (const file of [...e.target.files]) {
      if (file.size > 20 * 1024 * 1024) { toast('⚠️ El PDF supera 20 MB', 'error'); continue; }
      const dataUrl = await leerComoDataUrl(file);
      state._editPdfsPendientes.push({ dataUrl, nombre: file.name });
    }
    e.target.value = '';
    renderPdfsEdit();
  });
}

function manejarCambioUbicacionEdit() {
  const checked = document.querySelector('#location-grid-edit input[type="radio"]:checked');
  const sec = $('#constataciones-section-edit');
  if (!sec) return;
  checked?.value === 'Constataciones' ? sec.classList.add('visible') : sec.classList.remove('visible');
}

function renderFotasEdit() {
  const grid = $('#fotos-grid-edit');
  if (!grid) return;
  grid.innerHTML = '';

  // Existentes
  state._editFotasExistentes.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `<img src="${f.dataUrl}" alt="Foto" onclick="abrirLightbox('${f.dataUrl}')">
      <button class="photo-del" onclick="quitarFotoExistente(${idx})" title="Eliminar">✕</button>`;
    grid.appendChild(div);
  });
  // Nuevas
  state._editFotasPendientes.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.style.outline = '2px solid var(--accent)';
    div.innerHTML = `<img src="${f.dataUrl}" alt="Nueva foto" onclick="abrirLightbox('${f.dataUrl}')">
      <button class="photo-del" onclick="quitarFotoNuevaEdit(${idx})" title="Eliminar">✕</button>`;
    grid.appendChild(div);
  });
  // Botón agregar
  const total = state._editFotasExistentes.length + state._editFotasPendientes.length;
  if (total < MAX_FOTOS) {
    const label = document.createElement('label');
    label.className = 'photo-add-btn';
    label.innerHTML = `📷<input type="file" accept="image/*" capture="environment">`;
    label.querySelector('input').addEventListener('change', async e => {
      for (const file of [...e.target.files]) {
        if (state._editFotasExistentes.length + state._editFotasPendientes.length >= MAX_FOTOS) break;
        const c = await comprimirImagen(file);
        state._editFotasPendientes.push(c);
      }
      e.target.value = '';
      renderFotasEdit();
    });
    grid.appendChild(label);
  }
  const note = $('#fotos-count-edit');
  if (note) note.textContent = `${total}/${MAX_FOTOS} fotos`;
}

function quitarFotoExistente(idx) {
  const [f] = state._editFotasExistentes.splice(idx, 1);
  state._editFotasEliminar.push(f.id);
  renderFotasEdit();
}
function quitarFotoNuevaEdit(idx) {
  state._editFotasPendientes.splice(idx, 1);
  renderFotasEdit();
}

function renderPdfsEdit() {
  const listEl = $('#pdfs-list-edit');
  if (!listEl) return;
  listEl.innerHTML = [
    ...state._editPdfsExistentes.map((p, idx) => `
      <div class="pdf-item">
        <span class="pdf-icon">📄</span>
        <span class="pdf-name">${escapeHtml(p.nombre)}</span>
        <button class="pdf-view" onclick="verPdfMedia('${p.id}')">Ver</button>
        <button class="pdf-del" onclick="quitarPdfExistente(${idx})" title="Quitar">✕</button>
      </div>`),
    ...state._editPdfsPendientes.map((p, idx) => `
      <div class="pdf-item" style="border-color:var(--accent)">
        <span class="pdf-icon">📄</span>
        <span class="pdf-name">${escapeHtml(p.nombre)}</span>
        <button class="pdf-del" onclick="quitarPdfNuevoEdit(${idx})" title="Quitar">✕</button>
      </div>`),
  ].join('');
}

function quitarPdfExistente(idx) {
  const [p] = state._editPdfsExistentes.splice(idx, 1);
  state._editPdfsEliminar.push(p.id);
  renderPdfsEdit();
}
function quitarPdfNuevoEdit(idx) {
  state._editPdfsPendientes.splice(idx, 1);
  renderPdfsEdit();
}

async function verPdfMedia(mediaId) {
  const db = await DB.getMediaDeSecuestro(state.secuestroActualId);
  const m = db.find(x => x.id === mediaId);
  if (!m) return;
  const w = window.open();
  w.document.write(`<iframe src="${m.dataUrl}" style="width:100%;height:100vh;border:none"></iframe>`);
}

/* =============================================
   GUARDAR EDICIÓN
   ============================================= */
async function guardarEdicion() {
  const id = state.secuestroActualId;
  if (!id) return;
  const titulo = $('#edit-titulo').value.trim();
  if (!titulo) { toast('El título no puede estar vacío.', 'error'); return; }

  const ubicacion = document.querySelector('input[name="ubicacion-edit"]:checked')?.value || 'Base';

  // Eliminar medios marcados
  await Promise.all([
    ...state._editFotasEliminar.map(mid => DB.eliminarMedia(mid)),
    ...state._editPdfsEliminar.map(mid => DB.eliminarMedia(mid)),
  ]);

  // Guardar nuevos medios
  const nuevosMids = [];
  for (const f of state._editFotasPendientes) {
    const mid = await DB.guardarMedia(id, 'foto', f.dataUrl, f.nombre);
    nuevosMids.push(mid);
  }
  for (const p of state._editPdfsPendientes) {
    const mid = await DB.guardarMedia(id, 'pdf', p.dataUrl, p.nombre);
    nuevosMids.push(mid);
  }

  // mediaIds = existentes restantes + nuevos
  const existentesMids = [
    ...state._editFotasExistentes.map(f => f.id),
    ...state._editPdfsExistentes.map(p => p.id),
  ];
  const mediaIds = [...existentesMids, ...nuevosMids];

  DB.actualizar(id, {
    codigoBarras: $('#edit-codigo').value.trim(),
    titulo,
    fechaIngreso: $('#edit-ingreso').value,
    fechaEgreso: $('#edit-egreso').value || null,
    ubicacion,
    informacion: $('#edit-info').value.trim(),
    mediaIds,
  });

  toast('✅ Cambios guardados', 'success');
  renderDetalle(id);   // async, se re-renderiza
  renderLista();
  renderStats();
  mostrarVista('detalle');
}

/* =============================================
   ELIMINAR
   ============================================= */
function confirmarEliminar() { $('#modal-delete').classList.add('open'); }
function cerrarModal() { $('#modal-delete').classList.remove('open'); }

async function eliminarSecuestro() {
  const id = state.secuestroActualId;
  if (!id) return;
  await DB.eliminarTodosLosMedias(id);
  DB.eliminar(id);
  cerrarModal();
  toast('🗑️ Secuestro eliminado', 'info');
  renderLista();
  renderStats();
  mostrarVista('lista');
}

/* =============================================
   INICIALIZACIÓN
   ============================================= */
function init() {
  renderStats();
  renderLista();
  inicializarFiltros();
  inicializarFormNuevo();
  $('#fechaIngreso').value = DB.hoy();

  $('#nav-lista').addEventListener('click', () => mostrarVista('lista'));
  $('#nav-nuevo').addEventListener('click', () => {
    mostrarVista('nuevo');
    $('#fechaIngreso').value = DB.hoy();
    renderFotosPendientes();
    renderPdfsPendientes();
  });
  $('#fab-nuevo').addEventListener('click', () => {
    mostrarVista('nuevo');
    $('#fechaIngreso').value = DB.hoy();
    renderFotosPendientes();
    renderPdfsPendientes();
  });
  $('#topbar-back').addEventListener('click', () => {
    Scanner.detener();
    state.scannerActivo = false;
    renderLista();
    mostrarVista('lista');
  });
  $('#btn-cancel-delete').addEventListener('click', cerrarModal);
  $('#btn-confirm-delete').addEventListener('click', eliminarSecuestro);
  $('#modal-delete').addEventListener('click', e => { if (e.target === $('#modal-delete')) cerrarModal(); });
  $('#lightbox').addEventListener('click', cerrarLightbox);

  mostrarVista('lista');
}

// Globales
window.abrirDetalle = abrirDetalle;
window.guardarEdicion = guardarEdicion;
window.confirmarEliminar = confirmarEliminar;
window.cerrarModal = cerrarModal;
window.eliminarSecuestro = eliminarSecuestro;
window.abrirLightbox = abrirLightbox;
window.cerrarLightbox = cerrarLightbox;
window.eliminarFotoPendiente = eliminarFotoPendiente;
window.eliminarPdfPendiente = eliminarPdfPendiente;
window.verPdfPendiente = verPdfPendiente;
window.verPdfMedia = verPdfMedia;
window.quitarFotoExistente = quitarFotoExistente;
window.quitarFotoNuevaEdit = quitarFotoNuevaEdit;
window.quitarPdfExistente = quitarPdfExistente;
window.quitarPdfNuevoEdit = quitarPdfNuevoEdit;

document.addEventListener('DOMContentLoaded', init);
