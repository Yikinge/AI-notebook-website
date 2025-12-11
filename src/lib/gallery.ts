import { openDB, IDBPDatabase } from 'idb';

export type ChatRecord = {
  id: string;
  ts: number;
  imageUrl: string;
  title?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
};

const DB_NAME = 'dreamcanvas-db';
const STORE_NAME = 'gallery';

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export async function getGallery(): Promise<ChatRecord[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await getDB();
    const records = await db.getAll(STORE_NAME);
    return records.sort((a, b) => b.ts - a.ts); // Sort by newest first
  } catch (e) {
    console.error('Failed to get gallery', e);
    return [];
  }
}

export async function addRecord(rec: ChatRecord) {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.put(STORE_NAME, rec);
  } catch (e) {
    console.error('Failed to add record', e);
  }
}

export async function deleteRecord(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  } catch (e) {
    console.error('Failed to delete record', e);
  }
}

export async function clearGallery() {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (e) {
    console.error('Failed to clear gallery', e);
  }
}

