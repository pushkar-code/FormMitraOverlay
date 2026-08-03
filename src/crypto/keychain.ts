import * as Keychain from 'react-native-keychain';

const SERVICE_NAME = 'com.formmitraoverlay.vault';
const MASTER_KEY_ALIAS = 'master_aes_key';

export async function generateAndStoreMasterKey(): Promise<string> {
  const existing = await getMasterKey();
  if (existing) return existing;

  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const key = Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await Keychain.setGenericPassword(MASTER_KEY_ALIAS, key, {
    service: SERVICE_NAME,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return key;
}

export async function getMasterKey(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: SERVICE_NAME });
  return creds ? creds.password : null;
}

export async function deleteMasterKey(): Promise<boolean> {
  return Keychain.resetGenericPassword({ service: SERVICE_NAME });
}
