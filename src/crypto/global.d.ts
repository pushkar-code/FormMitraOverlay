declare var crypto: {
  getRandomValues(array: Uint8Array): Uint8Array;
  subtle: SubtleCrypto;
};

interface SubtleCrypto {
  encrypt(algorithm: AlgorithmIdentifier | RsaOaepParams | AesCmacParams | AesGcmParams, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
  decrypt(algorithm: AlgorithmIdentifier | RsaOaepParams | AesCmacParams | AesGcmParams, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
  importKey(format: KeyFormat, keyData: BufferSource | JsonWebKey, algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HkdfParams | HmacImportParams | AesKeyAlgorithm, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKey>;
}

interface CryptoKey {
  readonly algorithm: KeyAlgorithm;
  readonly extractable: boolean;
  readonly type: KeyType;
  readonly usages: KeyUsage[];
}

type KeyType = 'public' | 'private' | 'secret';
type KeyUsage = 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'deriveKey' | 'deriveBits' | 'wrapKey' | 'unwrapKey';
type KeyFormat = 'raw' | 'pkcs8' | 'spki' | 'jwk';
type AlgorithmIdentifier = Algorithm | string;

interface Algorithm {
  name: string;
}

interface RsaOaepParams extends Algorithm {
  label?: BufferSource;
}

interface AesGcmParams extends Algorithm {
  iv?: BufferSource;
  additionalData?: BufferSource;
  tagLength?: number;
}

interface AesCmacParams extends Algorithm {
  length?: number;
}

interface RsaHashedImportParams extends Algorithm {
  hash: AlgorithmIdentifier;
}

interface EcKeyImportParams extends Algorithm {
  namedCurve: string;
}

interface HkdfParams extends Algorithm {
  hash: AlgorithmIdentifier;
  salt?: BufferSource;
  info?: BufferSource;
}

interface HmacImportParams extends Algorithm {
  hash: AlgorithmIdentifier;
}

interface AesKeyAlgorithm extends Algorithm {
  length: number;
}

interface KeyAlgorithm {
  name: string;
}

interface TextEncoder {
  encode(input?: string): Uint8Array;
}

interface TextDecoder {
  decode(input?: BufferSource): string;
}

declare var TextEncoder: {
  new(): TextEncoder;
};

declare var TextDecoder: {
  new(): TextDecoder;
};

declare function atob(data: string): string;
declare function btoa(data: string): string;
