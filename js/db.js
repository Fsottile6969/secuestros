/**
 * db.js — Capa de datos
 * LocalStorage para secuestros + IndexedDB para medios (fotos y PDFs)
 */

/* =============================================
   LOCALSTORATE — SECUESTROS
   ============================================= */
const DB_KEY = 'secuestros_v1';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function cargarTodos() {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); }
  catch { return []; }
}
function guardarTodos(lista) { localStorage.setItem(DB_KEY, JSON.stringify(lista)); }

function getAll() { return cargarTodos(); }
function getById(id) { return cargarTodos().find(s => s.id === id) || null; }

function crear(datos) {
  const lista = cargarTodos();
  const nuevo = {
    id: uuid(),
    codigoBarras: datos.codigoBarras?.trim() || '',
    titulo: datos.titulo?.trim() || 'Sin título',
    fechaIngreso: datos.fechaIngreso || hoy(),
    fechaEgreso: datos.fechaEgreso || null,
    ubicacion: datos.ubicacion || 'Base',
    informacion: datos.informacion?.trim() || '',
    creadoEn: new Date().toISOString(),
    mediaIds: [],   // ids de fotos/PDFs en IndexedDB
  };
  lista.unshift(nuevo);
  guardarTodos(lista);
  return nuevo;
}

function actualizar(id, cambios) {
  const lista = cargarTodos();
  const idx = lista.findIndex(s => s.id === id);
  if (idx === -1) return null;
  lista[idx] = { ...lista[idx], ...cambios, id };
  guardarTodos(lista);
  return lista[idx];
}

function eliminar(id) {
  const lista = cargarTodos();
  const nueva = lista.filter(s => s.id !== id);
  if (nueva.length === lista.length) return false;
  guardarTodos(nueva);
  return true;
}

function buscar(termino) {
  const t = termino.toLowerCase().trim();
  if (!t) return cargarTodos();
  return cargarTodos().filter(s =>
    s.titulo.toLowerCase().includes(t) ||
    s.codigoBarras.toLowerCase().includes(t) ||
    s.ubicacion.toLowerCase().includes(t) ||
    s.informacion.toLowerCase().includes(t)
  );
}

function filtrarPorUbicacion(ubicacion) {
  const lista = cargarTodos();
  if (!ubicacion) return lista;
  return lista.filter(s => s.ubicacion === ubicacion);
}

function stats() {
  const lista = cargarTodos();
  return {
    total: lista.length,
    activos: lista.filter(s => !s.fechaEgreso).length,
    egresados: lista.filter(s => !!s.fechaEgreso).length,
  };
}

function hoy() { return new Date().toISOString().split('T')[0]; }

/* =============================================
   INDEXEDDB — MEDIOS (fotos y PDFs)
   ============================================= */
const IDB_NAME = 'secuestros_media';
const IDB_VER = 1;
const IDB_STORE = 'media';

let _idb = null;

function abrirIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Guarda un medio (foto o PDF) en IndexedDB.
 * @param {string} secuestroId
 * @param {'foto'|'pdf'} tipo
 * @param {string} dataUrl
 * @param {string} nombre — nombre de archivo original
 * @returns {Promise<string>} id del medio guardado
 */
async function guardarMedia(secuestroId, tipo, dataUrl, nombre) {
  const db = await abrirIDB();
  const id = uuid();
  const registro = { id, secuestroId, tipo, dataUrl, nombre, creadoEn: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add(registro);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Obtiene todos los medios de un secuestro.
 * @param {string} secuestroId
 * @returns {Promise<Array>}
 */
async function getMediaDeSecuestro(secuestroId) {
  const db = await abrirIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.filter(m => m.secuestroId === secuestroId));
    req.onerror = () => reject(req.error);
  });
}

/**
 * Elimina un medio por id.
 */
async function eliminarMedia(mediaId) {
  const db = await abrirIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(mediaId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Elimina todos los medios de un secuestro.
 */
async function eliminarTodosLosMedias(secuestroId) {
  const medios = await getMediaDeSecuestro(secuestroId);
  await Promise.all(medios.map(m => eliminarMedia(m.id)));
}

/* =============================================
   EXPORTAR
   ============================================= */
window.DB = {
  getAll, getById, crear, actualizar, eliminar,
  buscar, filtrarPorUbicacion, stats, hoy,
  guardarMedia, getMediaDeSecuestro, eliminarMedia, eliminarTodosLosMedias,
};
