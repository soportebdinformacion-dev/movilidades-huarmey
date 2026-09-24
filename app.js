// Asegúrate de colocar la URL exacta generada al Desplegar como Web App en Google Apps Script
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyKI8VhEn02S0jDX0LMhzKedumASd9R-suZnKVH9s7Fe1Rf-eXvg0MFWmXOZMPEyG0W/exec';

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
  const fechaInput = document.getElementById('ausFechaFalta');
  if (fechaInput) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }

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

  // Evento al seleccionar una placa en Movilidades
  document.getElementById('movPlaca').addEventListener('change', (e) => {
    const placaSeleccionada = e.target.value;
    const data = currentPlacasData.find((p) => p.placa === placaSeleccionada);
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

  document.getElementById('movPasajeros').addEventListener('input', calcFreeSeats);

  // Búsqueda automática de DNI
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
        document.getElementById('ausNombre').value = 'Sin conexión (no hallado local)';
      }
    } else {
      document.getElementById('ausNombre').value = '';
    }
  });

  // Mostrar u ocultar fecha de retorno
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

  // Botón para actualizar manualmente la lista de placas
  document.getElementById('btnSyncPlacas').addEventListener('click', async () => {
    if (navigator.onLine) {
      await fetchAndStoreMaestros();
      await loadPlacas();
      alert('Lista de placas actualizada correctamente.');
    } else {
      alert('Requiere conexión a internet para sincronizar la lista de placas.');
    }
  });

  document.getElementById('formMovilidades').addEventListener('submit', handleMovilidadesSubmit);
  document.getElementById('formAusentismos').addEventListener('submit', handleAusentismosSubmit);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (event && event.target) {
    event.target.classList.add('active');
  }
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

// Carga las placas desde IndexedDB o las consulta al servidor
async function loadPlacas() {
  currentPlacasData = await getLocalData('maestros');
  
  // Si no hay placas guardadas localmente y hay internet, se realiza la consulta a Google Apps Script
  if ((!currentPlacasData || currentPlacasData.length === 0) && navigator.onLine) {
    await fetchAndStoreMaestros();
    currentPlacasData = await getLocalData('maestros');
  }

  const movSelect = document.getElementById('movPlaca');
  const ausSelect = document.getElementById('ausPlaca');

  if (movSelect) movSelect.innerHTML = '<option value="">Seleccione placa...</option>';
  if (ausSelect) ausSelect.innerHTML = '<option value="">Seleccione placa...</option>';

  if (currentPlacasData && currentPlacasData.length > 0) {
    currentPlacasData.forEach(p => {
      if (movSelect) {
        const optM = document.createElement('option');
        optM.value = p.placa;
        optM.textContent = `${p.placa} - ${p.conductor}`;
        movSelect.appendChild(optM);
      }
      if (ausSelect) {
        const optA = document.createElement('option');
        optA.value = p.placa;
        optA.textContent = `${p.placa} - (${p.ruta})`;
        ausSelect.appendChild(optA);
      }
    });
  }
}

async function fetchAndStoreMaestros() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getMaestros`);
    const data = await res.json();
    if (data.maestros && data.maestros.length > 0) {
      await saveLocalData('maestros', data.maestros);
    }
    if (data.personal && data.personal.length > 0) {
      await saveLocalData('personal', data.personal);
    }
  } catch (e) {
    console.error('Error al descargar lista de maestros:', e);
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
  alert('Registro de movilidad guardado localmente.');
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
  alert('Registro de ausentismo guardado localmente.');
  updateSyncCounter();
  if (navigator.onLine) syncQueue();
}

function updateNetworkStatus() {
  const badge = document.getElementById('netStatus');
  if (badge) {
    if (navigator.onLine) {
      badge.textContent = '● Conectado';
      badge.className = 'status-badge online';
    } else {
      badge.textContent = '● Modo Offline';
      badge.className = 'status-badge offline';
    }
  }
}

async function updateSyncCounter() {
  const movs = await getQueueItems('queue_movilidades');
  const aus = await getQueueItems('queue_ausentismos');
  const badge = document.getElementById('syncStatus');
  if (badge) {
    badge.textContent = `Pendientes: ${movs.length + aus.length}`;
  }
}

async function syncQueue() {
  if (!navigator.onLine) return;

  const movs = await getQueueItems('queue_movilidades');
  for (const item of movs) {
    try {
      await sendToScript('saveMovilidad', item.value);
      await removeQueueItem('queue_movilidades', item.key);
    } catch (e) { break; }
  }

  const aus = await getQueueItems('queue_ausentismos');
  for (const item of aus) {
    try {
      await sendToScript('saveAusentismo', item.value);
      await removeQueueItem('queue_ausentismos', item.key);
    } catch (e) { break; }
  }

  updateSyncCounter();
}

async function sendToScript(action, data) {
  await fetch(SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload: data })
  });
  return { status: 'success' };
}
