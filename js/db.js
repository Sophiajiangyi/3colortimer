// db.js — IndexedDB 封装（Promise 化）。所有对 records store 的读写都走这里。
import { DB_NAME, DB_VERSION, STORE_NAME } from './config.js';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('startTime', 'startTime', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then((db) => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addRecord(record) {
  const store = await tx('readwrite');
  await wrapRequest(store.add(record));
  return record;
}

export async function updateRecord(record) {
  const store = await tx('readwrite');
  await wrapRequest(store.put(record));
  return record;
}

export async function removeRecord(id) {
  const store = await tx('readwrite');
  await wrapRequest(store.delete(id));
}

export async function getRecord(id) {
  const store = await tx('readonly');
  return wrapRequest(store.get(id));
}

export async function getAllRecords() {
  const store = await tx('readonly');
  return wrapRequest(store.getAll());
}

// 按 startTime 范围查询 [start, end)
export async function rangeQuery(start, end) {
  const store = await tx('readonly');
  const index = store.index('startTime');
  const range = IDBKeyRange.bound(start, end, false, true);
  return wrapRequest(index.getAll(range));
}

export async function clearAll() {
  const store = await tx('readwrite');
  await wrapRequest(store.clear());
}

export async function bulkPut(records) {
  const store = await tx('readwrite');
  await Promise.all(records.map((r) => wrapRequest(store.put(r))));
}
