// URL de despliegue de tu Google Apps Script
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzjO7rmOgLE1HDNVa2FCoNafV6mlBRbpz5BlleN0qJ5-I3vYNpupNN1gHGakHIDTqIo/exec";

let db = null;
let maestrosCache = [];
let personalCache = [];

// Inicialización de IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("HuarmeyDB", 1);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("maestros")) {
        database.createObjectStore("maestros", { keyPath: "placa" });
      }
      if (!database.objectStoreNames.contains("personal")) {
        database.createObjectStore("personal", { keyPath: "dni" });
      }
      if (!database.objectStoreNames.contains("syncQueue")) {
        database.createObjectStore("syncQueue", { autoIncrement: true });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject(e);
  });
}

// Operaciones IndexedDB
function saveToStore(storeName, items) {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  items.forEach(item => store.put(item));
}

function getFromStore(storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

function addToQueue(data) {
  return new Promise((resolve) => {
    const tx = db.transaction("syncQueue", "readwrite");
    const store = tx.objectStore("syncQueue");
    store.add(data);
    tx.oncomplete = () => {
      updateSyncStatus();
      resolve();
    };
  });
}

// Registro e Invocación de Eventos al Cargar
document.addEventListener("DOMContentLoaded", async () => {
  await initDB();
  setupNetworkListeners();
  setupUIEvents();
  
  // Establecer fecha por defecto en ausentismo
  document.getElementById("ausFecha").valueToDate = new Date();
  document.getElementById("ausFecha").value = new Date().toISOString().split('T')[0];
  
  // Cargar datos locales primero
  await loadLocalData();
  
  // Sincronizar maestros si hay red
  if (navigator.onLine) {
    syncMaestrosAndPersonal();
  }
});

// Monitoreo de Estado Red
function setupNetworkListeners() {
  window.addEventListener("online", handleNetworkChange);
  window.addEventListener("offline", handleNetworkChange);
  handleNetworkChange();
}

function handleNetworkChange() {
  const statusNet = document.getElementById("statusNetwork");
  const statusBar = document.getElementById("statusBar");
  
  if (navigator.onLine) {
    statusNet.innerHTML = `<i class="bi bi-wifi"></i> Conectado`;
    statusBar.className = "bg-success text-white text-center py-1 status-bar";
    processQueue();
  } else {
    statusNet.innerHTML = `<i class="bi bi-wifi-off"></i> Modo Offline (Guardado Local)`;
    statusBar.className = "bg-warning text-dark text-center py-1 status-bar";
  }
}

async function updateSyncStatus() {
  const queue = await getFromStore("syncQueue");
  const statusSync = document.getElementById("statusSync");
  statusSync.innerHTML = `<i class="bi bi-cloud"></i> Pendientes: ${queue.length}`;
}

// Carga de Maestros y Personal
async function syncMaestrosAndPersonal() {
  try {
    const resM = await fetch(`${GAS_API_URL}?action=getMaestros`);
    const dataM = await resM.json();
    if (dataM.status === "success") {
      maestrosCache = dataM.maestros;
      saveToStore("maestros", maestrosCache);
    }

    const resP = await fetch(`${GAS_API_URL}?action=getPersonal`);
    const dataP = await resP.json();
    if (dataP.status === "success") {
      personalCache = dataP.personal;
      saveToStore("personal", personalCache);
    }

    populateDropdowns();
  } catch (e) {
    console.warn("No se pudo actualizar maestros desde la nube, usando local.");
  }
}

async function loadLocalData() {
  maestrosCache = await getFromStore("maestros");
  personalCache = await getFromStore("personal");
  populateDropdowns();
}

function populateDropdowns() {
  const movPlaca = document.getElementById("movPlaca");
  const ausPlaca = document.getElementById("ausPlaca");

  movPlaca.innerHTML = '<option value="">Seleccione una placa...</option>';
  ausPlaca.innerHTML = '<option value="">Seleccione una placa...</option>';

  maestrosCache.forEach(m => {
    movPlaca.innerHTML += `<option value="${m.placa}">${m.placa}</option>`;
    ausPlaca.innerHTML += `<option value="${m.placa}">${m.placa}</option>`;
  });
}

// Configuración de UI e Interacciones de Formulario
function setupUIEvents() {
  // Cambio de Placa en Movilidades
  document.getElementById("movPlaca").addEventListener("change", (e) => {
    const m = maestrosCache.find(x => x.placa === e.target.value);
    if (m) {
      document.getElementById("movConductor").value = m.conductor;
      document.getElementById("movTipo").value = m.tipo;
      document.getElementById("movCapacidad").value = m.capacidad;
      document.getElementById("movRuta").value = m.ruta;
      document.getElementById("movCultivo").value = m.cultivo;
      calcAsientos();
    }
  });

  // Cálculo Dinámico de Asientos
  document.getElementById("movPasajeros").addEventListener("input", calcAsientos);

  // Cambio de Placa en Ausentismo
  document.getElementById("ausPlaca").addEventListener("change", (e) => {
    const m = maestrosCache.find(x => x.placa === e.target.value);
    document.getElementById("ausRuta").value = m ? m.ruta : "";
  });

  // Búsqueda de DNI Personal
  document.getElementById("ausDni").addEventListener("input", (e) => {
    const val = e.target.value;
    if (val.length === 8) {
      const p = personalCache.find(x => x.dni === val);
      document.getElementById("ausNombres").value = p ? p.nombres : "DNI NO ENCONTRADO EN MAESTRO";
    } else {
      document.getElementById("ausNombres").value = "";
    }
  });

  // Motivo de Ausentismo y Requerimiento de Observación
  document.getElementById("ausMotivo").addEventListener("change", (e) => {
    const val = e.target.value;
    const lbl = document.getElementById("lblAusObs");
    const obs = document.getElementById("ausObs");

    if (val.includes("(Especificar en obs)")) {
      lbl.innerHTML = 'Observaciones <span class="text-danger">*</span>';
      obs.required = true;
    } else {
      lbl.innerHTML = 'Observaciones';
      obs.required = false;
    }
  });

  // Despliegue Condicional de Retorno
  document.getElementById("ausRegresar").addEventListener("change", (e) => {
    const val = e.target.value;
    const group = document.getElementById("groupRetorno");
    if (val === "SI") {
      group.classList.remove("d-none");
    } else {
      group.classList.add("d-none");
    }
  });

  document.getElementById("ausRetornoOpcion").addEventListener("change", (e) => {
    const val = e.target.value;
    const inputF = document.getElementById("ausFechaRetorno");
    if (val === "Fecha específica") {
      inputF.classList.remove("d-none");
      inputF.required = true;
    } else {
      inputF.classList.add("d-none");
      inputF.required = false;
    }
  });

  // Envío Formulario Movilidad
  document.getElementById("formMovilidad").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      type: "movilidad",
      data: {
        placa: document.getElementById("movPlaca").value,
        conductor: document.getElementById("movConductor").value,
        tipo: document.getElementById("movTipo").value,
        capacidad: document.getElementById("movCapacidad").value,
        ruta: document.getElementById("movRuta").value,
        cultivo: document.getElementById("movCultivo").value,
        pasajeros: document.getElementById("movPasajeros").value,
        asientosLibres: document.getElementById("movAsientos").innerText,
        observaciones: document.getElementById("movObs").value
      }
    };

    await saveRecord(payload);
    e.target.reset();
    document.getElementById("boxAsientos").className = "p-3 text-center rounded alert-asientos bg-light text-dark border";
    document.getElementById("movAsientos").innerText = "0";
  });

  // Envío Formulario Ausentismo
  document.getElementById("formAusentismo").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    let retornoDet = "";
    const vaReg = document.getElementById("ausRegresar").value;
    if (vaReg === "SI") {
      const op = document.getElementById("ausRetornoOpcion").value;
      retornoDet = op === "Fecha específica" ? `Fecha: ${document.getElementById("ausFechaRetorno").value}` : op;
    }

    const payload = {
      type: "ausentismo",
      data: {
        placa: document.getElementById("ausPlaca").value,
        ruta: document.getElementById("ausRuta").value,
        dni: document.getElementById("ausDni").value,
        nombres: document.getElementById("ausNombres").value,
        fechaFalta: document.getElementById("ausFecha").value,
        motivo: document.getElementById("ausMotivo").value,
        observaciones: document.getElementById("ausObs").value,
        vaARegresar: vaReg,
        retornoDetalle: retornoDet
      }
    };

    await saveRecord(payload);
    e.target.reset();
    document.getElementById("groupRetorno").classList.add("d-none");
    document.getElementById("ausFecha").value = new Date().toISOString().split('T')[0];
  });

  // Forzar Actualización Manual
  document.getElementById("btnUpdateMaestros").addEventListener("click", () => {
    if (navigator.onLine) {
      syncMaestrosAndPersonal();
      alert("Listas actualizadas correctamente.");
    } else {
      alert("No hay conexión a Internet para actualizar la lista.");
    }
  });
}

function calcAsientos() {
  const cap = parseInt(document.getElementById("movCapacidad").value) || 0;
  const pas = parseInt(document.getElementById("movPasajeros").value) || 0;
  const libres = cap - pas;

  const display = document.getElementById("movAsientos");
  const box = document.getElementById("boxAsientos");

  display.innerText = libres;

  if (libres < 0) {
    box.className = "p-3 text-center rounded alert-asientos bg-danger text-white";
  } else if (libres === 0) {
    box.className = "p-3 text-center rounded alert-asientos bg-warning text-dark";
  } else {
    box.className = "p-3 text-center rounded alert-asientos bg-success text-white";
  }
}

// Sincronización y Procesamiento de Registros
async function saveRecord(payload) {
  if (navigator.onLine) {
    try {
      const res = await fetch(GAS_API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (resJson.status === "success") {
        alert("Registro enviado e ingresado con éxito.");
        return;
      }
    } catch (e) {
      console.warn("Fallo al enviar a la nube, guardando en cola offline.");
    }
  }

  await addToQueue(payload);
  alert("Sin conexión. Registro guardado localmente en el dispositivo.");
}

async function processQueue() {
  const tx = db.transaction("syncQueue", "readonly");
  const store = tx.objectStore("syncQueue");
  const req = store.openCursor();

  req.onsuccess = async (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      const key = cursor.key;

      try {
        const res = await fetch(GAS_API_URL, {
          method: "POST",
          body: JSON.stringify(item)
        });
        const resJson = await res.json();

        if (resJson.status === "success") {
          const deleteTx = db.transaction("syncQueue", "readwrite");
          deleteTx.objectStore("syncQueue").delete(key);
        }
      } catch (err) {
        console.error("Error sincronizando ítem de la cola:", err);
      }
      cursor.continue();
    } else {
      updateSyncStatus();
    }
  };
}

// Registro de Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("Service Worker Registrado con Éxito"))
    .catch((err) => console.error("Error al registrar SW:", err));
}
