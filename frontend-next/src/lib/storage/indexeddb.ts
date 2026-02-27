import { decryptJson, deriveKeyFromPassphrase, encryptJson } from "@/lib/crypto/webcrypto";

const DB_NAME = "secure_chat_cache";
const DB_VERSION = 1;
const STORE_NAME = "kv";

interface StoredRecord {
  key: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

function putRecord(db: IDBDatabase, record: StoredRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to write record"));
  });
}

function getRecord(db: IDBDatabase, key: string): Promise<StoredRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as StoredRecord | undefined) ?? null);
    req.onerror = () => reject(req.error || new Error("Failed to read record"));
  });
}

export async function setEncryptedItem<T>(
  key: string,
  value: T,
  passphrase: string,
  salt = "expense-chat-v1",
): Promise<void> {
  const db = await openDb();
  const cryptoKey = await deriveKeyFromPassphrase(passphrase, salt);
  const encrypted = await encryptJson(cryptoKey, value);
  await putRecord(db, {
    key,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    updatedAt: Date.now(),
  });
  db.close();
}

export async function getEncryptedItem<T>(
  key: string,
  passphrase: string,
  salt = "expense-chat-v1",
): Promise<T | null> {
  const db = await openDb();
  const record = await getRecord(db, key);
  db.close();
  if (!record) return null;

  const cryptoKey = await deriveKeyFromPassphrase(passphrase, salt);
  return decryptJson<T>(cryptoKey, {
    iv: record.iv,
    ciphertext: record.ciphertext,
  });
}
