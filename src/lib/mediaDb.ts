/** IndexedDB store for large media (data URLs) — avoids localStorage quota */

const DB_NAME = 'shul-screen-media';
const DB_VERSION = 1;
const STORE = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function putMediaBlob(id: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).put(dataUrl, id));
  } finally {
    db.close();
  }
}

export async function getMediaBlob(id: string): Promise<string | null> {
  const db = await openDb();
  try {
    const value = await idbReq(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(id),
    );
    return typeof value === 'string' ? value : null;
  } finally {
    db.close();
  }
}

export async function deleteMediaBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}
