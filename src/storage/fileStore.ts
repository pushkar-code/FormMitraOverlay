import RNFS from 'react-native-fs';
import { encryptEnvelope, decryptEnvelope, EncryptedEnvelope } from '../crypto/vault';

const SANDBOX_DIR = `${RNFS.DocumentDirectoryPath}/.sandbox`;
const CACHE_DIR = `${RNFS.CachesDirectoryPath}/stronghold_cache`;
const MANIFEST_FILE = `${SANDBOX_DIR}/manifest.json`;

export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  envelope: EncryptedEnvelope;
  storedAt: number;
  accessedAt: number;
  checksum: string;
}

export interface FileManifest {
  files: StoredFile[];
  lastModified: number;
}

export interface CacheEntry {
  id: string;
  cachePath: string;
  expiresAt: number;
}

const activeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function ensureDirectories(): Promise<void> {
  const sandboxExists = await RNFS.exists(SANDBOX_DIR);
  if (!sandboxExists) {
    await RNFS.mkdir(SANDBOX_DIR);
  }

  const cacheExists = await RNFS.exists(CACHE_DIR);
  if (!cacheExists) {
    await RNFS.mkdir(CACHE_DIR);
  }
}

async function readManifest(): Promise<FileManifest> {
  try {
    const exists = await RNFS.exists(MANIFEST_FILE);
    if (!exists) {
      return { files: [], lastModified: 0 };
    }
    const raw = await RNFS.readFile(MANIFEST_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { files: [], lastModified: 0 };
  }
}

async function writeManifest(manifest: FileManifest): Promise<void> {
  manifest.lastModified = Date.now();
  await RNFS.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf8');
}

function generateId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeChecksum(data: Uint8Array): Promise<string> {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function storeFile(
  sourcePath: string,
  fileName: string,
  mimeType: string = 'application/octet-stream'
): Promise<StoredFile> {
  await ensureDirectories();

  const fileContent = await RNFS.readFile(sourcePath, 'base64');
  const binaryString = atob(fileContent);
  const dataBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    dataBytes[i] = binaryString.charCodeAt(i);
  }
  const checksum = await computeChecksum(dataBytes);

  const envelope = await encryptEnvelope(fileContent);

  const id = generateId();
  const encryptedFileName = `${id}.enc`;
  const encryptedPath = `${SANDBOX_DIR}/${encryptedFileName}`;

  const envelopeData = JSON.stringify(envelope);
  await RNFS.writeFile(encryptedPath, envelopeData, 'utf8');

  const stat = await RNFS.stat(sourcePath);

  const storedFile: StoredFile = {
    id,
    originalName: fileName,
    mimeType,
    size: parseInt(stat.size as any, 10) || 0,
    envelope,
    storedAt: Date.now(),
    accessedAt: Date.now(),
    checksum,
  };

  const manifest = await readManifest();
  manifest.files.push(storedFile);
  await writeManifest(manifest);

  return storedFile;
}

export async function storeFileData(
  data: string | Uint8Array,
  fileName: string,
  mimeType: string = 'application/octet-stream'
): Promise<StoredFile> {
  await ensureDirectories();

  let base64Data: string;
  let dataBytes: Uint8Array;

  if (typeof data === 'string') {
    dataBytes = new TextEncoder().encode(data);
    let binary = '';
    for (let i = 0; i < dataBytes.length; i++) {
      binary += String.fromCharCode(dataBytes[i]);
    }
    base64Data = btoa(binary);
  } else {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    base64Data = btoa(binary);
    dataBytes = data;
  }

  const checksum = await computeChecksum(dataBytes);
  const envelope = await encryptEnvelope(base64Data);

  const id = generateId();
  const encryptedFileName = `${id}.enc`;
  const encryptedPath = `${SANDBOX_DIR}/${encryptedFileName}`;

  await RNFS.writeFile(encryptedPath, JSON.stringify(envelope), 'utf8');

  const storedFile: StoredFile = {
    id,
    originalName: fileName,
    mimeType,
    size: dataBytes.length,
    envelope,
    storedAt: Date.now(),
    accessedAt: Date.now(),
    checksum,
  };

  const manifest = await readManifest();
  manifest.files.push(storedFile);
  await writeManifest(manifest);

  return storedFile;
}

export async function decryptToCache(fileId: string): Promise<string> {
  await ensureDirectories();

  const manifest = await readManifest();
  const file = manifest.files.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  const existing = activeCache.get(fileId);
  if (existing && Date.now() < existing.expiresAt) {
    const exists = await RNFS.exists(existing.cachePath);
    if (exists) {
      file.accessedAt = Date.now();
      await writeManifest(manifest);
      return existing.cachePath;
    }
    activeCache.delete(fileId);
  }

  const encryptedPath = `${SANDBOX_DIR}/${fileId}.enc`;
  const encryptedExists = await RNFS.exists(encryptedPath);
  if (!encryptedExists) {
    throw new Error(`Encrypted file missing: ${fileId}`);
  }

  const envelopeRaw = await RNFS.readFile(encryptedPath, 'utf8');
  const envelope: EncryptedEnvelope = JSON.parse(envelopeRaw);

  const base64Data = await decryptEnvelope(envelope);

  const ext = file.originalName.split('.').pop() || 'bin';
  const cacheFileName = `${fileId}.${ext}`;
  const cachePath = `${CACHE_DIR}/${cacheFileName}`;

  await RNFS.writeFile(cachePath, base64Data, 'base64');

  activeCache.set(fileId, {
    id: fileId,
    cachePath,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  file.accessedAt = Date.now();
  await writeManifest(manifest);

  return cachePath;
}

export async function getCachedPath(fileId: string): Promise<string | null> {
  const entry = activeCache.get(fileId);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    activeCache.delete(fileId);
    try {
      await RNFS.unlink(entry.cachePath);
    } catch {}
    return null;
  }

  const exists = await RNFS.exists(entry.cachePath);
  if (!exists) {
    activeCache.delete(fileId);
    return null;
  }

  return entry.cachePath;
}

export async function removeFile(fileId: string): Promise<boolean> {
  const manifest = await readManifest();
  const fileIndex = manifest.files.findIndex((f) => f.id === fileId);
  if (fileIndex === -1) return false;

  const encryptedPath = `${SANDBOX_DIR}/${fileId}.enc`;
  try {
    await RNFS.unlink(encryptedPath);
  } catch {}

  const cached = activeCache.get(fileId);
  if (cached) {
    activeCache.delete(fileId);
    try {
      await RNFS.unlink(cached.cachePath);
    } catch {}
  }

  manifest.files.splice(fileIndex, 1);
  await writeManifest(manifest);

  return true;
}

export async function listFiles(): Promise<StoredFile[]> {
  await ensureDirectories();
  const manifest = await readManifest();
  return manifest.files;
}

export async function getFileInfo(fileId: string): Promise<StoredFile | null> {
  const manifest = await readManifest();
  return manifest.files.find((f) => f.id === fileId) || null;
}

async function secureDeleteFile(path: string): Promise<void> {
  try {
    const stat = await RNFS.stat(path);
    const size = parseInt(stat.size as any, 10) || 0;
    if (size > 0 && size <= 5 * 1024 * 1024) {
      await RNFS.writeFile(path, '0'.repeat(size), 'utf8').catch(() => {});
    }
  } catch {}
  await RNFS.unlink(path).catch(() => {});
}

export async function deleteDecryptedFile(fileId: string): Promise<boolean> {
  const entry = activeCache.get(fileId);
  if (!entry) {
    return false;
  }
  activeCache.delete(fileId);
  await secureDeleteFile(entry.cachePath);
  return true;
}

export async function purgeDecryptedCache(): Promise<number> {
  let removed = 0;
  const cacheExists = await RNFS.exists(CACHE_DIR);
  if (!cacheExists) return 0;
  const files = await RNFS.readdir(CACHE_DIR);
  for (const file of files) {
    await secureDeleteFile(`${CACHE_DIR}/${file}`);
    removed++;
  }
  activeCache.clear();
  return removed;
}

export async function clearCache(): Promise<void> {
  const cacheExists = await RNFS.exists(CACHE_DIR);
  if (cacheExists) {
    const files = await RNFS.readdir(CACHE_DIR);
    for (const file of files) {
      await RNFS.unlink(`${CACHE_DIR}/${file}`).catch(() => {});
    }
  }
  activeCache.clear();
}

export async function clearAll(): Promise<void> {
  await clearCache();

  const sandboxExists = await RNFS.exists(SANDBOX_DIR);
  if (sandboxExists) {
    const files = await RNFS.readdir(SANDBOX_DIR);
    for (const file of files) {
      await RNFS.unlink(`${SANDBOX_DIR}/${file}`).catch(() => {});
    }
  }

  activeCache.clear();
  await writeManifest({ files: [], lastModified: Date.now() });
}

export async function getStorageStats(): Promise<{
  fileCount: number;
  totalSize: number;
  cacheCount: number;
  sandboxPath: string;
  cachePath: string;
}> {
  const manifest = await readManifest();
  const totalSize = manifest.files.reduce((sum, f) => sum + f.size, 0);

  let cacheCount = 0;
  const cacheExists = await RNFS.exists(CACHE_DIR);
  if (cacheExists) {
    const files = await RNFS.readdir(CACHE_DIR);
    cacheCount = files.length;
  }

  return {
    fileCount: manifest.files.length,
    totalSize,
    cacheCount,
    sandboxPath: SANDBOX_DIR,
    cachePath: CACHE_DIR,
  };
}

export async function rotateCache(): Promise<void> {
  const now = Date.now();
  const expired: string[] = [];

  activeCache.forEach((entry, id) => {
    if (now >= entry.expiresAt) {
      expired.push(id);
    }
  });

  for (const id of expired) {
    const entry = activeCache.get(id);
    if (entry) {
      activeCache.delete(id);
      try {
        await RNFS.unlink(entry.cachePath);
      } catch {}
    }
  }
}
