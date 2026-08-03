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
  FlatList,
  Modal,
} from 'react-native';
import NativeOverlay, { FormApp } from './src/native/NativeOverlay';
import { generateAndStoreMasterKey } from './src/crypto/keychain';

const SAMPLE_FIELDS = [
  { label: 'Full Name', value: 'Rahul Kumar Singh', source: 'Aadhaar Card', sensitive: false },
  { label: 'Aadhaar Number', value: '123456789012', source: 'Aadhaar Card', sensitive: true },
  { label: 'Date of Birth', value: '15/08/1995', source: 'Aadhaar Card', sensitive: false },
  { label: 'Phone Number', value: '9876543210', source: 'Phone Records', sensitive: true },
  { label: 'Email', value: 'rahul@example.com', source: 'Email Records', sensitive: false },
  { label: 'Father Name', value: 'Ram Kumar Singh', source: 'Marksheet', sensitive: false },
  { label: 'Address', value: 'Village Rampur, Dist. Lucknow, UP - 226001', source: 'Aadhaar Card', sensitive: false },
  { label: 'Mother Name', value: 'Sita Kumar Singh', source: 'Marksheet', sensitive: false },
  { label: 'Roll Number', value: 'CBSE-2023-12345', source: 'Marksheet', sensitive: false },
  { label: 'Board', value: 'CBSE', source: 'Marksheet', sensitive: false },
  { label: 'Percentage', value: '92.4%', source: 'Marksheet', sensitive: false },
  { label: 'Passport Number', value: 'R1234567', source: 'Passport', sensitive: true },
];

function App() {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const [appPickerVisible, setAppPickerVisible] = useState(false);
  const [installedApps, setInstalledApps] = useState<FormApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<FormApp | null>(null);

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

  const loadInstalledApps = async () => {
    const apps = await NativeOverlay.getInstalledFormApps();
    setInstalledApps(apps);
    setAppPickerVisible(true);
  };

  const handleSelectApp = async (app: FormApp) => {
    setSelectedApp(app);
    setAppPickerVisible(false);

    const perm = await refreshPermission();
    if (!perm) {
      NativeOverlay.requestPermission();
      Alert.alert(
        'Permission Required',
        'Please enable "Display over other apps" for Form Mitra, then try again.'
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

    setTimeout(() => {
      NativeOverlay.splitScreen(app.packageName);
    }, 500);
  };

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
            2. Tap "Split Screen" to open a form app alongside{'\n'}
            3. Overlay appears with your masked document fields{'\n'}
            4. Tap a field to decrypt & reveal{'\n'}
            5. Drag the ⠿ handle to move the overlay{'\n'}
            6. Scroll within the overlay to see all fields
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vault Status</Text>
          <Text style={styles.cardBody}>
            Master key: {keyReady ? 'Ready (Android Keystore)' : 'Initializing...'}{'\n'}
            Overlay permission: {hasPermission ? 'Granted' : 'Not granted'}
            {selectedApp ? `\nTarget: ${selectedApp.appName}` : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btnSplit}
          onPress={loadInstalledApps}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Split Screen + Overlay</Text>
          <Text style={styles.btnSubtext}>Pick a form app, overlay shows on right</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btn}
          onPress={handleShowOverlay}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>
            {overlayVisible ? 'Refresh Overlay' : 'Show Overlay Only'}
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
          Overlay scrollable + draggable
        </Text>
      </View>

      <Modal
        visible={appPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAppPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Form App</Text>
            <Text style={styles.modalSubtitle}>
              Pick the app to open in split-screen with overlay
            </Text>
            <FlatList
              data={installedApps}
              keyExtractor={(item) => item.packageName}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.appItem}
                  onPress={() => handleSelectApp(item)}
                >
                  <Text style={styles.appName}>{item.appName}</Text>
                  <Text style={styles.appPackage}>{item.packageName}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No apps found</Text>
              }
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setAppPickerVisible(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
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
  cardBody: { color: '#ccc', fontSize: 13, lineHeight: 20 },
  btnSplit: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSubtext: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
  btnHide: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ff4646',
  },
  btnHideText: { color: '#ff4646' },
  note: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 16,
  },
  appItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  appName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  appPackage: { color: '#666', fontSize: 11, marginTop: 2 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', padding: 20 },
  modalClose: {
    marginTop: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalCloseText: { color: '#ff4646', fontSize: 16, fontWeight: '600' },
});

export default App;
