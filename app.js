// Reemplaza esta URL con la URL del Web App de tu Google Apps Script
const SCRIPT_URL = 'https://script.google.com/macros/s/TU_SCRIPT_ID/exec';

let currentPlacasData = [];

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  initApp();
  setupEventListeners();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.log('SW error:', err));
  }
}

async function initApp() {
  // Establecer fecha por defecto a HOY
  document.getElementById('ausFechaFalta').valueToDate = new Date();
  document.getElementById('ausFechaFalta').value = new Date().toISOString().split('T')[0];

  updateNetworkStatus();
  await loadPlacas();
  updateSyncCounter();

  if (navigator.onLine) {
    syncQueue();
  }
}

function setupEventListeners() {
  window.addEventListener('online', () => { updateNetworkStatus(); syncQueue(); });
  window.addEventListener('offline', () => { updateNetworkStatus(); });

  // Selección de placa en Movilidades
  document.getElementById('movPlaca').addEventListener('change', (e) => {
    const placa = e.target.value;
    const data = currentPlacasData.find((p) => p.placa === placa);
    if (data) {
      document.getElementById('movConductor').value = data.conductor || '';
      document.getElementById('movTipoCap').value = `${data.tipo || ''} (${data.capacidad || 0} pax)`;
      document.getElementById('movRutaCultivo').value = `${data.ruta || ''} / ${data.cultivo || ''}`;
      document.getElementById('movPlaca').dataset.capacidad = data.capacidad || 0;
      calcFreeSeats();
    } else {
      clearMovFields();
    }
  });

  // Cálculo de asientos libres
  document.getElementById('movPasajeros').addEventListener('input', calcFreeSeats);

  // Búsqueda de DNI automática en Ausentismo
  document.getElementById('ausDni').addEventListener('input', async (e) => {
    const dni = e.target.value.trim();
    if (dni.length === 8) {
      document.getElementById('ausNombre').value = 'Buscando...';
      const person = await getLocalItem('personal', dni);
      if (person) {
        document.getElementById('ausNombre').value = person.nombre;
      } else if (navigator.onLine) {
        try {
          const res = await fetch(`${SCRIPT_URL}?action=getPersonal&dni=${dni}`);
          const data = await res.json();
          if (data && data.nombre) {
            document.getElementById('ausNombre').value = data.nombre;
            saveLocalData('personal', [data]);
          } else {
            document.getElementById('ausNombre').value = 'No encontrado';
          }
        } catch (err) {
          document.getElementById('ausNombre').value = 'Error al consultar';
        }
      } else {
        document.getElementById('ausNombre').value = 'Sin conexión (No hallado local)';
      }
    } else {
      document.getElementById('ausNombre').value = '';
    }
  });

  // Mostrar / ocultar fecha de retorno
  document.getElementById('ausRegresa').addEventListener('change', (e) => {
    const group = document.getElementById('groupFechaRetorno');
    if (e.target.value === 'SI') {
      group.classList.remove('hidden');
    } else {
      group.classList.add('hidden');
    }
  });

  document.getElementById('ausTipoRetorno').addEventListener('change', (e) => {
    const inputFecha = document.getElementById('ausFechaRetorno');
    if (e.target.value === 'Fecha Especifica') {
      inputFecha.classList.remove('hidden');
    } else {
      inputFecha.classList.add('hidden');
    }
  });

  // Actualizar lista manual de placas
  document.getElementById('btnSyncPlacas').addEventListener('click', async () => {
    if (navigator.onLine) {
      await fetchAndStoreMaestros();
      await loadPlacas();
      alert('Lista de placas actualizada');
    } else {
      alert('Requiere conexión a internet');
    }
  });

  // Submits
  document.getElementById('formMovilidades').addEventListener('submit', handleMovilidadesSubmit);
  document.getElementById('formAusentismos').addEventListener('submit', handleAusentismosSubmit);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

function calcFreeSeats() {
  const cap = parseInt(document.getElementById('movPlaca').dataset.capacidad || 0);
  const pas = parseInt(document.getElementById('movPasajeros').value || 0);
  document.getElementById('movAsientosLibres').value = cap - pas;
}

function clearMovFields() {
  document.getElementById('movConductor').value = '';
  document.getElementById('movTipoCap').value = '';
  document.getElementById('movRutaCultivo').value = '';
  document.getElementById('movAsientosLibres').value = '';
  document.getElementById('movPlaca').dataset.capacidad = 0;
}

async function loadPlacas() {
  currentPlacasData = await getLocalData('maestros');
  if (currentPlacasData.length === 0 && navigator.onLine) {
    await fetchAndStoreMaestros();
    currentPlacasData = await getLocalData('maestros');
  }

  const movSelect = document.getElementById('movPlaca');
  const ausSelect = document.getElementById('ausPlaca');
  
  movSelect.innerHTML = '<option value="">Seleccione placa...</option>';
  ausSelect.innerHTML = '<option value="">Seleccione placa...</option>';

  currentPlacasData.forEach(p => {
    movSelect.innerHTML += `<option value="${p.placa}">${p.placa} - ${p.conductor}</option>`;
    ausSelect.innerHTML += `<option value="${p.placa}">${p.placa} - (${p.ruta})</option>`;
  });
}

async function fetchAndStoreMaestros() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getMaestros`);
    const data = await res.json();
    if (data.maestros) await saveLocalData('maestros', data.maestros);
    if (data.personal) await saveLocalData('personal', data.personal);
  } catch (e) {
    console.error('Error al descargar maestros', e);
  }
}

async function handleMovilidadesSubmit(e) {
  e.preventDefault();
  const payload = {
    fechaRegistro: new Date().toISOString(),
    placa: document.getElementById('movPlaca').value,
    conductor: document.getElementById('movConductor').value,
    tipoCapacidad: document.getElementById('movTipoCap').value,
    rutaCultivo: document.getElementById('movRutaCultivo').value,
    pasajeros: document.getElementById('movPasajeros').value,
    asientosLibres: document.getElementById('movAsientosLibres').value,
    observaciones: document.getElementById('movObservaciones').value
  };

  await addQueueItem('queue_movilidades', payload);
  document.getElementById('formMovilidades').reset();
  clearMovFields();
  alert('Registro guardado localmente');
  updateSyncCounter();
  if (navigator.onLine) syncQueue();
}

async function handleAusentismosSubmit(e) {
  e.preventDefault();
  const regresa = document.getElementById('ausRegresa').value;
  let fechaRetorno = 'N/A';
  if (regresa === 'SI') {
    const tipo = document.getElementById('ausTipoRetorno').value;
    fechaRetorno = tipo === 'Inmediato' ? 'Inmediato' : document.getElementById('ausFechaRetorno').value;
  }

  const payload = {
    fechaRegistro: new Date().toISOString(),
    placaRuta: document.getElementById('ausPlaca').value,
    dni: document.getElementById('ausDni').value,
    nombre: document.getElementById('ausNombre').value,
    fechaFalta: document.getElementById('ausFechaFalta').value,
    motivo: document.getElementById('ausMotivo').value,
    regresa: regresa,
    fechaRetorno: fechaRetorno
  };

  await addQueueItem('queue_ausentismos', payload);
  document.getElementById('formAusentismos').reset();
  document.getElementById('groupFechaRetorno').classList.add('hidden');
  alert('Ausentismo guardado localmente');
  updateSyncCounter();
  if (navigator.onLine) syncQueue();
}

function updateNetworkStatus() {
  const badge = document.getElementById('netStatus');
  if (navigator.onLine) {
    badge.textContent = '● Conectado';
    badge.className = 'status-badge online';
  } else {
    badge.textContent = '● Modo Offline';
    badge.className = 'status-badge offline';
  }
}

async function updateSyncCounter() {
  const movs = await getQueueItems('queue_movilidades');
  const aus = await getQueueItems('queue_ausentismos');
  document.getElementById('syncStatus').textContent = `Pendientes: ${movs.length + aus.length}`;
}

async function syncQueue() {
  if (!navigator.onLine) return;

  const movs = await getQueueItems('queue_movilidades');
  for (const item of movs) {
    try {
      const res = await sendToScript('saveMovilidad', item.value);
      if (res.status === 'success') await removeQueueItem('queue_movilidades', item.key);
    } catch (e) { break; }
  }

  const aus = await getQueueItems('queue_ausentismos');
  for (const item of aus) {
    try {
      const res = await sendToScript('saveAusentismo', item.value);
      if (res.status === 'success') await removeQueueItem('queue_ausentismos', item.key);
    } catch (e) { break; }
  }

  updateSyncCounter();
}

async function sendToScript(action, data) {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload: data })
  });
  return { status: 'success' };
}