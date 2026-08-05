export function clearString(value: string): string {
  return '';
}

export function clearObject(obj: Record<string, any>): void {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = '';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      clearObject(obj[key]);
    }
  }
}

export function clearArray(arr: any[]): void {
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'string') {
      arr[i] = '';
    } else if (typeof arr[i] === 'object' && arr[i] !== null) {
      if (Array.isArray(arr[i])) {
        clearArray(arr[i]);
      } else {
        clearObject(arr[i]);
      }
    }
  }
}

export function secureWipe(ref: React.MutableRefObject<any>): void {
  if (ref.current && typeof ref.current === 'object') {
    if (Array.isArray(ref.current)) {
      clearArray(ref.current);
    } else {
      clearObject(ref.current);
    }
  }
  ref.current = null;
}

export interface FieldEntry {
  label: string;
  value: any;
  source: string;
  sensitive: boolean;
}

export function wipeFieldEntries(fields: FieldEntry[]): void {
  for (const field of fields) {
    if (typeof field.value === 'string') {
      field.value = '';
    } else if (field.value && typeof field.value === 'object') {
      field.value = { ciphertext: '', iv: '', tag: '' };
    }
  }
}
