const DB_NAME = 'AgricolaHuarmeyDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('maestros')) {
        db.createObjectStore('maestros', { keyPath: 'placa' });
      }
      if (!db.objectStoreNames.contains('personal')) {
        db.createObjectStore('personal', { keyPath: 'dni' });
      }
      if (!db.objectStoreNames.contains('queue_movilidades')) {
        db.createObjectStore('queue_movilidades', { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('queue_ausentismos')) {
        db.createObjectStore('queue_ausentismos', { autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalData(storeName, items) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await store.clear();
  for (const item of items) {
    store.put(item);
  }
  return tx.complete;
}

async function getLocalData(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

async function getLocalItem(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return new Promise((resolve) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
  });
}

async function addQueueItem(storeName, data) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.add(data);
  return tx.complete;
}

async function getQueueItems(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return new Promise((resolve) => {
    const request = store.openCursor();
    const results = [];
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}

async function removeQueueItem(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.delete(key);
  return tx.complete;
}