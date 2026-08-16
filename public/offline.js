(function () {
  const DATABASE = 'busops-offline-v2', STORE = 'actions';
  let databasePromise;

  function database() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB er ikke tilgængelig'));
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offlinekøen kunne ikke åbnes'));
    });
    return databasePromise;
  }

  async function transaction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE);
      let value;
      try { value = operation(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(value?.result);
      tx.onerror = () => reject(tx.error || new Error('Offlinekøen kunne ikke opdateres'));
      tx.onabort = () => reject(tx.error || new Error('Offlinekøen blev afbrudt'));
    });
  }

  const list = async () => {
    const values = await transaction('readonly', store => store.getAll());
    return (values || []).sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  };
  const put = action => transaction('readwrite', store => store.put(action));
  const remove = id => transaction('readwrite', store => store.delete(id));
  const clear = () => transaction('readwrite', store => store.clear());

  window.BusOpsOffline = { list, put, remove, clear };
})();
