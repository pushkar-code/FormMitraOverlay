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
  Switch,
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
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [appPickerVisible, setAppPickerVisible] = useState(false);
  const [installedApps, setInstalledApps] = useState<FormApp[]>([]);

  const appState = useRef(AppState.currentState);

  const refreshPermission = async () => {
    const perm = await NativeOverlay.checkPermission();
    setHasPermission(perm);
    return perm;
  };

  const refreshAccessibility = async () => {
    const enabled = await NativeOverlay.isAccessibilityEnabled();
    setAccessibilityEnabled(enabled);
    return enabled;
  };

  useEffect(() => {
    (async () => {
      await generateAndStoreMasterKey();
      setKeyReady(true);
      await refreshPermission();
      await refreshAccessibility();

      const sub = NativeOverlay.onOverlayShown(() => setOverlayVisible(true));
      const sub2 = NativeOverlay.onOverlayHidden(() => setOverlayVisible(false));
      const sub3 = NativeOverlay.onOverlayError((e) =>
        Alert.alert('Overlay Error', e.message)
      );

      const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (appState.current.match(/inactive|background/) && next === 'active') {
          refreshPermission();
          refreshAccessibility();
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
    setAppPickerVisible(false);

    const perm = await refreshPermission();
    if (!perm) {
      NativeOverlay.requestPermission();
      Alert.alert('Permission Required', 'Enable "Display over other apps" for Form Mitra.');
      return;
    }

    if (!keyReady) {
      Alert.alert('Error', 'Encryption key not ready yet.');
      return;
    }

    NativeOverlay.showOverlay({ fields: JSON.stringify(SAMPLE_FIELDS) });

    setTimeout(() => {
      NativeOverlay.splitScreen(app.packageName);
    }, 500);
  };

  const handleShowOverlay = async () => {
    const perm = await refreshPermission();
    if (!perm) {
      NativeOverlay.requestPermission();
      Alert.alert('Permission Required', 'Enable "Display over other apps" for Form Mitra.');
      return;
    }

    if (!keyReady) {
      Alert.alert('Error', 'Encryption key not ready yet.');
      return;
    }

    NativeOverlay.showOverlay({ fields: JSON.stringify(SAMPLE_FIELDS) });
  };

  const handleHideOverlay = () => {
    NativeOverlay.hideOverlay();
    setOverlayVisible(false);
  };

  const handleToggleAccessibility = () => {
    if (!accessibilityEnabled) {
      Alert.alert(
        'Enable Auto-Detect',
        'Form Mitra needs accessibility access to detect when you are filling a form in another app. This will automatically open split-screen with the overlay.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => NativeOverlay.openAccessibilitySettings() },
        ]
      );
    } else {
      Alert.alert(
        'Disable Auto-Detect',
        'Go to Settings → Accessibility → Form Mitra and toggle it off.',
        [
          { text: 'OK' },
          { text: 'Open Settings', onPress: () => NativeOverlay.openAccessibilitySettings() },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a1a" />

      <View style={styles.inner}>
        <Text style={styles.logo}>Form Mitra</Text>
        <Text style={styles.subtitle}>Encrypted Screen Overlay</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.cardTitle}>Auto-Detect Forms</Text>
              <Text style={styles.cardDesc}>
                {accessibilityEnabled
                  ? 'Active — overlay triggers when form detected'
                  : 'Off — enable to auto-trigger on form apps'}
              </Text>
            </View>
            <Switch
              value={accessibilityEnabled}
              onValueChange={handleToggleAccessibility}
              trackColor={{ false: '#333', true: '#7c3aed' }}
              thumbColor={accessibilityEnabled ? '#fff' : '#666'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How it works</Text>
          <Text style={styles.cardBody}>
            1. Enable auto-detect above (one-time setup){'\n'}
            2. Open any form app and start filling fields{'\n'}
            3. Form detected → split-screen + overlay auto-opens{'\n'}
            4. Drag the divider to resize (default 50/50){'\n'}
            5. Tap fields to decrypt & reveal values
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vault Status</Text>
          <Text style={styles.cardBody}>
            Master key: {keyReady ? 'Ready' : 'Initializing...'}{'\n'}
            Overlay permission: {hasPermission ? 'Granted' : 'Not granted'}{'\n'}
            Auto-detect: {accessibilityEnabled ? 'Active' : 'Disabled'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btnSplit}
          onPress={loadInstalledApps}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Manual Split Screen</Text>
          <Text style={styles.btnSubtext}>Pick a form app manually</Text>
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
          Device: Oppo CPH2681 | Overlay scrollable + draggable
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
    fontSize: 32, fontWeight: '800', color: '#fff',
    textAlign: 'center', marginBottom: 4,
  },
  subtitle: {
    fontSize: 14, color: '#666',
    textAlign: 'center', marginBottom: 32,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, padding: 16, marginBottom: 16,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  cardTitle: {
    color: '#888', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', marginBottom: 4,
  },
  cardDesc: { color: '#ccc', fontSize: 13 },
  cardBody: { color: '#ccc', fontSize: 13, lineHeight: 20 },
  btnSplit: {
    backgroundColor: '#7c3aed', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  btn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSubtext: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
  btnHide: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ff4646',
  },
  btnHideText: { color: '#ff4646' },
  note: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 8 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '70%',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSubtitle: { color: '#888', fontSize: 12, marginBottom: 16 },
  appItem: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    padding: 14, marginBottom: 8,
  },
  appName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  appPackage: { color: '#666', fontSize: 11, marginTop: 2 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', padding: 20 },
  modalClose: { marginTop: 12, padding: 14, alignItems: 'center' },
  modalCloseText: { color: '#ff4646', fontSize: 16, fontWeight: '600' },
});

export default App;
