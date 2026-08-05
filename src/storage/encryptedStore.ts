import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptEnvelope, decryptEnvelope, EncryptedEnvelope } from '../crypto/vault';

const STORE_PREFIX = '@formmitra_encrypted:';
const QUEUE_KEY = `${STORE_PREFIX}submit_queue`;
const META_KEY = `${STORE_PREFIX}meta`;

export interface StoredEncryptedBlob {
  id: string;
  envelope: EncryptedEnvelope;
  fieldCount: number;
  sensitiveCount: number;
  storedAt: number;
  submitted: boolean;
}

export interface StoreMeta {
  totalBlobs: number;
  lastStoredAt: number;
  lastFlushedAt: number;
}

async function getMeta(): Promise<StoreMeta> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : { totalBlobs: 0, lastStoredAt: 0, lastFlushedAt: 0 };
  } catch {
    return { totalBlobs: 0, lastStoredAt: 0, lastFlushedAt: 0 };
  }
}

async function setMeta(meta: StoreMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

function generateId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function storeEncryptedFields(
  fields: Array<{ label: string; value: string; source: string; sensitive: boolean }>
): Promise<StoredEncryptedBlob> {
  const envelope = await encryptEnvelope(JSON.stringify(fields));
  const sensitiveCount = fields.filter((f) => f.sensitive).length;

  const blob: StoredEncryptedBlob = {
    id: generateId(),
    envelope,
    fieldCount: fields.length,
    sensitiveCount,
    storedAt: Date.now(),
    submitted: false,
  };

  const existingRaw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: StoredEncryptedBlob[] = existingRaw ? JSON.parse(existingRaw) : [];
  queue.push(blob);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

  const meta = await getMeta();
  await setMeta({
    totalBlobs: meta.totalBlobs + 1,
    lastStoredAt: Date.now(),
    lastFlushedAt: meta.lastFlushedAt,
  });

  return blob;
}

export async function getPendingBlobs(): Promise<StoredEncryptedBlob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: StoredEncryptedBlob[] = raw ? JSON.parse(raw) : [];
    return queue.filter((b) => !b.submitted);
  } catch {
    return [];
  }
}

export async function getAllBlobs(): Promise<StoredEncryptedBlob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function markBlobSubmitted(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: StoredEncryptedBlob[] = raw ? JSON.parse(raw) : [];
  const updated = queue.map((b) => (b.id === id ? { ...b, submitted: true } : b));
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
}

export async function markBlobsSubmitted(ids: string[]): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: StoredEncryptedBlob[] = raw ? JSON.parse(raw) : [];
  const idSet = new Set(ids);
  const updated = queue.map((b) => (idSet.has(b.id) ? { ...b, submitted: true } : b));
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));

  const meta = await getMeta();
  await setMeta({ ...meta, lastFlushedAt: Date.now() });
}

export async function removeBlob(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: StoredEncryptedBlob[] = raw ? JSON.parse(raw) : [];
  const updated = queue.filter((b) => b.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
}

export async function clearAllBlobs(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
  await setMeta({ totalBlobs: 0, lastStoredAt: 0, lastFlushedAt: 0 });
}

export async function retrieveAndDecryptBlob(
  blob: StoredEncryptedBlob
): Promise<Array<{ label: string; value: string; source: string; sensitive: boolean }>> {
  const json = await decryptEnvelope(blob.envelope);
  return JSON.parse(json);
}

export async function getStoreMeta(): Promise<StoreMeta> {
  return getMeta();
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPendingBlobs();
  return pending.length;
}
