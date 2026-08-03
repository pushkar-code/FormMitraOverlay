import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import NativeOverlay from './src/native/NativeOverlay';
import {
  generateAndStoreMasterKey,
} from './src/crypto/keychain';

const SAMPLE_FIELDS = [
  { label: 'Full Name', value: 'Rahul Kumar Singh', source: 'Aadhaar Card', sensitive: false },
  { label: 'Aadhaar Number', value: '123456789012', source: 'Aadhaar Card', sensitive: true },
  { label: 'Date of Birth', value: '15/08/1995', source: 'Aadhaar Card', sensitive: false },
  { label: 'Phone Number', value: '9876543210', source: 'Phone Records', sensitive: true },
  { label: 'Email', value: 'rahul@example.com', source: 'Email Records', sensitive: false },
  { label: 'Father Name', value: 'Ram Kumar Singh', source: 'Marksheet', sensitive: false },
  { label: 'Address', value: 'Village Rampur, Dist. Lucknow, UP - 226001', source: 'Aadhaar Card', sensitive: false },
];

function App() {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [keyReady, setKeyReady] = useState(false);

  const appState = useRef(AppState.currentState);

  const refreshPermission = async () => {
    const perm = await NativeOverlay.checkPermission();
    setHasPermission(perm);
    return perm;
  };

  useEffect(() => {
    (async () => {
      await generateAndStoreMasterKey();
      setKeyReady(true);
      await refreshPermission();

      const sub = NativeOverlay.onOverlayShown(() => setOverlayVisible(true));
      const sub2 = NativeOverlay.onOverlayHidden(() => setOverlayVisible(false));
      const sub3 = NativeOverlay.onOverlayError((e) =>
        Alert.alert('Overlay Error', e.message)
      );

      const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (appState.current.match(/inactive|background/) && next === 'active') {
          refreshPermission();
        }
        appState.current = next;
      });

      return () => {
        sub.remove();
        sub2.remove();
        sub3.remove();
        appSub.remove();
      };
    })();
  }, []);

  const handleShowOverlay = async () => {
    const perm = await refreshPermission();
    if (!perm) {
      NativeOverlay.requestPermission();
      Alert.alert(
        'Permission Required',
        'Please enable "Display over other apps" for Form Mitra, then tap the button again.'
      );
      return;
    }

    if (!keyReady) {
      Alert.alert('Error', 'Encryption key not ready yet.');
      return;
    }

    NativeOverlay.showOverlay({
      fields: JSON.stringify(SAMPLE_FIELDS),
    });
    setOverlayVisible(true);
  };

  const handleHideOverlay = () => {
    NativeOverlay.hideOverlay();
    setOverlayVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a1a" />

      <View style={styles.inner}>
        <Text style={styles.logo}>Form Mitra</Text>
        <Text style={styles.subtitle}>Encrypted Screen Overlay</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How it works</Text>
          <Text style={styles.cardBody}>
            1. Documents encrypted with AES-256-GCM{'\n'}
            2. Overlay renders as native window over any app{'\n'}
            3. Fields shown masked — tap to decrypt & reveal{'\n'}
            4. FLAG_SECURE blocks screenshots{'\n'}
            5. No plaintext in logs or storage
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vault Status</Text>
          <Text style={styles.cardBody}>
            Master key: {keyReady ? 'Ready (Android Keystore)' : 'Initializing...'}{'\n'}
            Overlay permission: {hasPermission ? 'Granted' : 'Not granted'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btn}
          onPress={handleShowOverlay}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>
            {overlayVisible ? 'Refresh Overlay' : 'Show Encrypted Overlay'}
          </Text>
        </TouchableOpacity>

        {overlayVisible && (
          <TouchableOpacity
            style={[styles.btn, styles.btnHide]}
            onPress={handleHideOverlay}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, styles.btnHideText]}>Hide Overlay</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.note}>
          Overlay shows over all apps
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardBody: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnHide: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ff4646',
  },
  btnHideText: {
    color: '#ff4646',
  },
  note: {
    color: '#444',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default App;
