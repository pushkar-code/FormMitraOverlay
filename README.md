# StrongHold

**E2E-encrypted floating overlay that helps you fill out forms in any other app.** When you open a form elsewhere on your phone, StrongHold detects it, shows a persistent notification + a draggable bubble, and gives you a half-screen overlay of your stored personal fields — masked until you tap to reveal, and encrypted at rest with AES-256-GCM.

> **Android only.** The entire overlay layer (floating bubble, half-screen overlay, accessibility detection, foreground service) is implemented as custom **Kotlin/Android** native code. There is **no iOS implementation** of the overlay module; all iOS template files have been removed from this repo, and the app does not run on iOS.

- Branch: `StrongHold`
- Package / applicationId: `com.stronghold`
- App name (RN root component): `StrongHold`
- Stack: React Native **0.86.2** · React **19.2.3** · TypeScript · Hermes · New Architecture (Fabric) enabled

---

## What it does

1. Enable **auto-detect** (one-time accessibility grant) — or just show the bubble manually.
2. Open any app that contains a form (≥ 2 input fields detected in the active window).
3. StrongHold posts a notification and spawns a purple **FM bubble**.
4. Tap the bubble → a **half-screen overlay** appears over the form app, listing your fields.
5. Each field is **masked** by default; tap a field to decrypt + reveal it (values are wiped when you collapse).
6. **Encrypt & Queue** — encrypt the captured fields and add them to a secure batch queue.
7. **Save to Private Sandbox** — encrypt and store files / JSON into a private encrypted file vault.
8. Submit queued blobs in batches to your backend.

---

## Architecture

```
┌────────────────────────────── JS / TS (Hermes) ─────────────────────────────┐
│  App.tsx (dashboard)                                                        │
│  src/overlay/OverlayContent.tsx  ← RN overlay UI (registered as a root)     │
│  src/crypto/vault.ts            AES-256-GCM (WebCrypto)                      │
│  src/crypto/keychain.ts         256-bit master key (Keychain)               │
│  src/crypto/secureQueue.ts      batched submit queue                        │
│  src/storage/encryptedStore.ts  encrypted blob queue (AsyncStorage)         │
│  src/storage/fileStore.ts       encrypted file sandbox + temp decrypt cache │
│  src/network/apiClient.ts       submit/health HTTP client                   │
│  src/native/NativeOverlay.ts    JS bridge wrapper for OverlayModule         │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │ NativeModule calls / events
┌────────────────────────────── Native (Kotlin / Android) ────────────────────┐
│  OverlayModule.kt      bubble + half-screen overlay (WindowManager)         │
│  BubbleService.kt      foreground service + persistent notification         │
│  FormDetectorService.kt AccessibilityService (form detection)               │
│  FormDetectReceiver.kt broadcast receiver                                   │
│  OverlayPackage.kt     ReactPackage registration                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

JS entry (`index.js`) installs runtime polyfills **before** the app boots:

1. `TextEncoder` / `TextDecoder` (UTF-8 codecs, needed by the crypto layer).
2. `react-native-get-random-values` → `crypto.getRandomValues`.
3. `react-native-quick-crypto` `install()` → WebCrypto (`crypto.subtle`) backed by native OpenSSL.

---

## Encryption & decryption

All cryptography is **AES-256-GCM**, performed on the JS layer through the **WebCrypto API** (`crypto.subtle`) provided by `react-native-quick-crypto` — a native C++/JSI module (OpenSSL underneath), **not** Android's Keystore cipher. The key *material* is protected by Android Keystore.

### Key management — `src/crypto/keychain.ts`
- A random **256-bit master key** (32 bytes) is generated once and stored with `react-native-keychain` (`setGenericPassword`, `service = com.stronghold.vault`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
- On Android, Keychain stores it in Keystore-encrypted SharedPreferences.
- The key is fetched from JS and imported into WebCrypto as `AES-GCM` (non-extractable) on every operation.

### Envelope — `src/crypto/vault.ts`
Every encrypted payload is an `EncryptedEnvelope`:

```ts
interface EncryptedEnvelope {
  ciphertext: string;   // hex
  iv: string;           // 12-byte IV, hex
  authTag: string;      // 16-byte GCM tag, hex
  timestamp: number;
  version: number;
}
```

- `encryptEnvelope(plaintext)` / `decryptEnvelope(envelope)` — AES-256-GCM with `tagLength: 128`.
- WebCrypto returns `ciphertext ‖ tag`; the code splits the trailing 16 bytes into `authTag` and re-joins `ciphertext ‖ authTag` for decryption.
- `encryptFieldData()` / `decryptFieldData()` — convenience wrappers for `{ label, value, source, sensitive }[]`.

### Storage — `src/storage/`
| Module | What it stores | Where |
|---|---|---|
| `encryptedStore.ts` | Encrypted field blobs + submit-queue metadata | AsyncStorage (`@stronghold_encrypted:*`) |
| `fileStore.ts` | Encrypted files + manifest | App documents `.sandbox/` (`*.enc` JSON envelopes), temp decrypt cache in Caches `stronghold_cache/` |

### Decrypt-to-view flow (files)
`decryptToCache(fileId)` → decrypts the `.enc` envelope → writes the plaintext to a **temp cache** file (TTL 5 min) → `OverlayModule.openDecryptedFile()` hands it to the system viewer via `FileProvider` → on app resume the cache file is **secure-deleted** (zero-filled then unlinked). Plaintext never persists in the sandbox.

### Field masking
`maskValue` / `maskAadhaar` (`XXXX-XXXX-<last4>`) / `maskPhone` hide values until explicitly tapped. Decrypted values are held in memory refs and wiped (`secureWipe`) on collapse / unmount.

---

## Overlay & accessibility (native Android)

### `OverlayModule.kt`
The core `ReactContextBaseJavaModule` (`OverlayModule`). Public surface (see `src/native/NativeOverlay.ts`):

| Method | Purpose |
|---|---|
| `checkPermission` / `requestPermission` | `Settings.canDrawOverlays` + system "display over other apps" intent |
| `showOverlay` / `hideOverlay` / `isShowing` | Show/hide the bubble+overlay from the activity |
| `showBubble(fields)` | Draggable **FM bubble** (`WindowManager`, `TYPE_APPLICATION_OVERLAY`, `FLAG_SECURE`) |
| `showFullOverlay(fields)` | Half-screen, scrollable overlay built from raw Android Views; drag handle, per-field tap-to-reveal |
| `startBubbleService` / `showOverlayFromService` / `stopBubbleService` | Drive `BubbleService` via intents |
| `isAccessibilityEnabled` / `openAccessibilitySettings` | Check/enable the accessibility service |
| `refreshNotification` | Re-pin the foreground notification |
| `pickFile` / `pickFiles` / `openFileManager` | System file picker (`ACTION_GET_CONTENT`) |
| `openDecryptedFile` | Open a temp-cached decrypted file via `FileProvider` |
| events | `onOverlayShown`, `onOverlayHidden`, `onOverlayError` (via `DeviceEventManagerModule`) |

The overlay is drawn **entirely in Kotlin** (not React Native views) so it can be placed over other apps; `FLAG_SECURE` keeps it out of screenshots.

### `BubbleService.kt`
Foreground service (`foregroundServiceType="dataSync"`) with a persistent notification. Requests battery-optimization exemption. Re-spawns the bubble after process death (`START_STICKY`). Handles `SHOW_BUBBLE`, `SHOW_OVERLAY`, `HIDE_ALL`, `REFRESH_NOTIFICATION`, `RECREATE_BUBBLE`, `STOP` actions.

### `FormDetectorService.kt` + `FormDetectReceiver.kt`
- An `AccessibilityService` that watches `TYPE_WINDOW_STATE_CHANGED` / `TYPE_WINDOW_CONTENT_CHANGED`, counts **editable input fields** in the active window, and when **≥ 2** are found broadcasts `com.stronghold.FORM_DETECTED` (package-name scoped, with a 15 s cooldown).
- The receiver converts that broadcast into the bubble/notification flow.

### Manifest (key entries)
`SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`; the accessibility service `<service>` + `@xml/accessibility_config`; `FormDetectReceiver`; `FileProvider` (`${applicationId}.fileprovider`, `@xml/file_paths`).

---

## Batch submit & API — `src/network/apiClient.ts`

- Default base URL: `https://api.stronghold.example.com` — **placeholder; override at runtime** via `configureApi({ baseUrl })`.
- `checkServerHealth()` → `GET /health`
- `submitPayload()` → `POST /v1/submissions/batch`
- `secureQueue.flush()` decrypts pending blobs locally, chunks them into **batches of 10**, and POSTs:

```json
{
  "payloads": [
    {
      "id": "<blobId>",
      "data": [ { "label": "...", "value": "...", "source": "...", "sensitive": true } ],
      "encrypted": false,
      "clientTimestamp": 1720000000000
    }
  ]
}
```

- Headers: `Content-Type: application/json`, `X-Client-Version`, `X-Payload-Encryption: aes-256-gcm`.
- Successful batches are marked submitted in the local queue.

---

## Project layout

```
index.js                 polyfills + AppRegistry (StrongHold, OverlayContent)
App.tsx                  dashboard (permissions, vault status, sandbox, submit)
src/
  native/NativeOverlay.ts
  crypto/  vault.ts keychain.ts secureQueue.ts global.d.ts
  storage/ encryptedStore.ts fileStore.ts
  network/ apiClient.ts
  overlay/ OverlayContent.tsx OverlayScreen.tsx
  utils/   sanitizer.ts
android/                 Gradle project, Kotlin overlay/services/manifest
-                        (iOS removed — not supported)
```

---

## Build & run (Android)

### Requirements
| Tool | Version |
|---|---|
| Node | **≥ 22.11** |
| JDK | **17 or 21** (do **not** use JDK 25 with AGP) |
| Android SDK | compileSdk/targetSdk **36**, minSdk **24** |
| NDK | **27.1.12297006** (required — quick-crypto / nitro compile C++ from source) |
| CMake | required for the same C++ build |
| Gradle | via wrapper (9.3.1) |

### Setup
```bash
npm install

export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$HOME/Android/Sdk
export JAVA_HOME=/path/to/jdk21   # e.g. /opt/android-studio/jbr

# android/local.properties (gitignored)
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties
```

### Run (debug) on a physical device
```bash
npx react-native start                  # Metro
adb reverse tcp:8081 tcp:8081           # physical device → Metro over USB
npx react-native run-android            # build + install + launch
```

### Build APK only
```bash
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

### Permissions on first run
1. **Display over other apps** — required for the bubble/overlay.
2. **Accessibility / Auto-Detect** — required for automatic form detection.

---

## Debugging

- JS console: `adb logcat | grep ReactNativeJS`
- Native bridge: `adb logcat | grep -iE "OverlayModule|BubbleService|FormDetectorService|stronghold"`
- Metro logs: `~/.cache/… ` / the terminal where `react-native start` runs.
- `FATAL/AndroidRuntime` in logcat = native crash (Kotlin side).

---

## Security notes & limitations

- Data is encrypted at rest with AES-256-GCM; keys stay in Android Keystore-backed storage.
- Overlay views use `FLAG_SECURE` (no screenshots of revealed fields).
- Decrypted temp files are zero-wiped after use.
- The overlay is Android-only; no iOS support.
- The default API endpoint is a **placeholder** — set your real backend with `configureApi()`.
- `App.tsx` ships hardcoded `SAMPLE_FIELDS` for demo/testing — replace with your data source.
