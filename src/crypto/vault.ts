import 'react-native-get-random-values';
import { getMasterKey } from './keychain';

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

function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function generateIV(): Uint8Array {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

async function getKey(): Promise<CryptoKey> {
  const hexKey = await getMasterKey();
  if (!hexKey) throw new Error('Master key not found. Call generateAndStoreMasterKey first.');

  const rawKey = hexToBytes(hexKey);
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export async function encrypt(plaintext: string): Promise<EncryptedPayload> {
  const key = await getKey();
  const iv = generateIV();
  const data = stringToBytes(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    data
  );

  const fullBuffer = new Uint8Array(encrypted);
  const ciphertext = fullBuffer.slice(0, fullBuffer.length - 16);
  const tag = fullBuffer.slice(fullBuffer.length - 16);

  return {
    ciphertext: bytesToHex(ciphertext),
    iv: bytesToHex(iv),
    tag: bytesToHex(tag),
  };
}

export async function decrypt(payload: EncryptedPayload): Promise<string> {
  const key = await getKey();
  const iv = hexToBytes(payload.iv);
  const ciphertext = hexToBytes(payload.ciphertext);
  const tag = hexToBytes(payload.tag);

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  );

  return bytesToString(new Uint8Array(decrypted));
}

export function maskValue(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) return value;
  const masked = '*'.repeat(value.length - visibleChars);
  return masked + value.slice(-visibleChars);
}

export function maskAadhaar(aadhaar: string): string {
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length !== 12) return maskValue(aadhaar);
  return `XXXX-XXXX-${clean.slice(-4)}`;
}

export function maskPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return maskValue(phone);
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}
