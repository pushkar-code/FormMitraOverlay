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
  ScrollView,
} from 'react-native';
import NativeOverlay, { PickedFile } from './src/native/NativeOverlay';
import { generateAndStoreMasterKey } from './src/crypto/keychain';
import { secureQueue } from './src/crypto/secureQueue';
import { getPendingCount, clearAllBlobs, getPendingBlobs, StoredEncryptedBlob } from './src/storage/encryptedStore';
import { checkServerHealth } from './src/network/apiClient';
import { clearAll, getStorageStats, clearCache, storeFileData, listFiles, removeFile, decryptToCache, deleteDecryptedFile, purgeDecryptedCache, StoredFile } from './src/storage/fileStore';

const SAMPLE_FIELDS = [
  { label: 'Full Name', value: 'John Doe', source: 'Demo', sensitive: false },
  { label: 'Aadhaar Number', value: '000000000000', source: 'Demo', sensitive: true },
  { label: 'Date of Birth', value: '01/01/2000', source: 'Demo', sensitive: false },
  { label: 'Phone Number', value: '0000000000', source: 'Demo', sensitive: true },
  { label: 'Email', value: 'demo@example.com', source: 'Demo', sensitive: false },
  { label: 'Father Name', value: 'Demo Father', source: 'Demo', sensitive: false },
  { label: 'Address', value: '123 Demo Street, Demo City, IN - 000000', source: 'Demo', sensitive: false },
  { label: 'Mother Name', value: 'Demo Mother', source: 'Demo', sensitive: false },
  { label: 'Roll Number', value: 'DEMO-2023-00000', source: 'Demo', sensitive: false },
  { label: 'Board', value: 'DEMO', source: 'Demo', sensitive: false },
  { label: 'Percentage', value: '00.0%', source: 'Demo', sensitive: false },
  { label: 'Passport Number', value: 'X0000000', source: 'Demo', sensitive: true },
];

function App() {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [sandboxStats, setSandboxStats] = useState<{
    fileCount: number;
    totalSize: number;
    cacheCount: number;
  } | null>(null);
  const [submitPickerVisible, setSubmitPickerVisible] = useState(false);
  const [pendingBlobs, setPendingBlobs] = useState<StoredEncryptedBlob[]>([]);
  const [selectedBlobs, setSelectedBlobs] = useState<Set<string>>(new Set());
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const [sandboxFiles, setSandboxFiles] = useState<StoredFile[]>([]);
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);

  const appState = useRef(AppState.currentState);
  const viewedFilesRef = useRef<Set<string>>(new Set());

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

  const refreshPendingCount = async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  };

  const refreshSandboxStats = async () => {
    try {
      const stats = await getStorageStats();
      setSandboxStats({
        fileCount: stats.fileCount,
        totalSize: stats.totalSize,
        cacheCount: stats.cacheCount,
      });
    } catch {}
  };

  const loadSandboxFiles = async () => {
    try {
      const files = await listFiles();
      setSandboxFiles(files);
    } catch {}
  };

  const purgeViewedDecryptedFiles = async () => {
    if (viewedFilesRef.current.size > 0) {
      const ids = Array.from(viewedFilesRef.current);
      viewedFilesRef.current.clear();
      for (const id of ids) {
        await deleteDecryptedFile(id);
      }
    }
    await purgeDecryptedCache();
    await refreshSandboxStats();
  };

  useEffect(() => {
    (async () => {
      await generateAndStoreMasterKey();
      setKeyReady(true);
      await refreshPermission();
      await refreshAccessibility();
      await secureQueue.init();
      await refreshPendingCount();
      await refreshSandboxStats();
      await loadSandboxFiles();
      await purgeViewedDecryptedFiles();

      NativeOverlay.startBubbleService(JSON.stringify(SAMPLE_FIELDS));

      const sub = NativeOverlay.onOverlayShown(() => setOverlayVisible(true));
      const sub2 = NativeOverlay.onOverlayHidden(() => setOverlayVisible(false));
      const sub3 = NativeOverlay.onOverlayError((e) =>
        Alert.alert('Overlay Error', e.message)
      );

      const queueUnsubscribe = secureQueue.subscribe((count) => {
        setPendingCount(count);
      });

      const appSub = AppState.addEventListener('change', async (next: AppStateStatus) => {
        if (appState.current.match(/inactive|background/) && next === 'active') {
          await refreshPermission();
          const enabled = await refreshAccessibility();
          if (enabled) NativeOverlay.refreshNotification();
          await refreshPendingCount();
          await refreshSandboxStats();
          await loadSandboxFiles();
          await purgeViewedDecryptedFiles();
          checkServerHealth().then(setServerOnline);
        }
        appState.current = next;
      });

      checkServerHealth().then(setServerOnline);

      return () => {
        sub.remove();
        sub2.remove();
        sub3.remove();
        appSub.remove();
        queueUnsubscribe();
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

    NativeOverlay.showOverlayFromService(JSON.stringify(SAMPLE_FIELDS));
  };

  const handleHideOverlay = () => {
    NativeOverlay.stopBubbleService();
    setOverlayVisible(false);
  };

  const handleOpenSubmitPicker = async () => {
    const blobs = await getPendingBlobs();
    setPendingBlobs(blobs);
    setSelectedBlobs(new Set());
    setSubmitPickerVisible(true);
  };

  const handleToggleBlobSelection = (id: string) => {
    setSelectedBlobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllBlobs = () => {
    if (selectedBlobs.size === pendingBlobs.length) {
      setSelectedBlobs(new Set());
    } else {
      setSelectedBlobs(new Set(pendingBlobs.map((b) => b.id)));
    }
  };

  const handleSubmitSelected = async () => {
    if (selectedBlobs.size === 0) {
      Alert.alert('No Selection', 'Please select at least one item to submit.');
      return;
    }

    setSubmitPickerVisible(false);
    setFlushing(true);

    try {
      const results = await secureQueue.flush();
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      await refreshPendingCount();

      if (failCount > 0) {
        Alert.alert(
          'Partial Submit',
          `Submitted ${successCount} batch(es), ${failCount} failed. Check server connection.`
        );
      } else if (successCount > 0) {
        Alert.alert('Submitted', `${successCount} batch(es) sent to server successfully.`);
      } else {
        Alert.alert('No Data', 'No pending data was submitted.');
      }
    } catch (error) {
      Alert.alert('Submit Error', 'Failed to submit data. Please try again.');
    } finally {
      setFlushing(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await NativeOverlay.pickFiles();
      if (result.files && result.files.length > 0) {
        setPickedFiles(result.files);

        for (const file of result.files) {
          const jsonData = JSON.stringify({
            fileName: file.name,
            mimeType: file.mimeType,
            size: file.size,
            uri: file.uri,
            pickedAt: new Date().toISOString(),
          }, null, 2);

          await storeFileData(jsonData, `picked_${file.name}.json`, 'application/json');
        }

        await refreshSandboxStats();
        Alert.alert(
          'Files Stored',
          `${result.files.length} file(s) encrypted and stored in private sandbox.`
        );
      }
    } catch (error: any) {
      if (error?.code !== 'CANCELLED' && !String(error?.message).includes('CANCELLED')) {
        Alert.alert('Error', 'Failed to pick files.');
      }
    }
  };

  const handleOpenFileManager = async () => {
    try {
      await NativeOverlay.openFileManager();
    } catch (error) {
      Alert.alert('Error', 'Failed to open file manager.');
    }
  };

  const handleViewFile = async (file: StoredFile) => {
    if (viewingFileId) return;

    setViewingFileId(file.id);
    try {
      const cachePath = await decryptToCache(file.id);
      viewedFilesRef.current.add(file.id);
      await NativeOverlay.openDecryptedFile(cachePath, file.mimeType);
    } catch (error: any) {
      await deleteDecryptedFile(file.id);
      Alert.alert(
        'Decrypt Failed',
        error?.message || 'Could not decrypt and open the file.'
      );
    } finally {
      setViewingFileId(null);
    }
  };

  const handleDeleteSandboxFile = async (file: StoredFile) => {
    Alert.alert(
      'Delete Encrypted File',
      `Permanently delete "${file.originalName}" from the private sandbox?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDecryptedFile(file.id);
            await removeFile(file.id);
            await refreshSandboxStats();
            await loadSandboxFiles();
          },
        },
      ]
    );
  };

  const handleFlushQueue = async () => {
    await handleOpenSubmitPicker();
  };

  const handleClearStorage = async () => {
    Alert.alert(
      'Clear Local Storage',
      'This will remove all locally stored encrypted data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllBlobs();
            await refreshPendingCount();
            Alert.alert('Cleared', 'Local encrypted storage cleared.');
          },
        },
      ]
    );
  };

  const handleClearSandbox = async () => {
    Alert.alert(
      'Clear Private Sandbox',
      'This will remove all encrypted files from the private sandbox. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            await refreshSandboxStats();
            Alert.alert('Cleared', 'Private sandbox and cache cleared.');
          },
        },
      ]
    );
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Temp Cache',
      'This will remove all decrypted files from the temporary cache. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await clearCache();
            await refreshSandboxStats();
            Alert.alert('Cleared', 'Temporary cache cleared.');
          },
        },
      ]
    );
  };

  const handleToggleAccessibility = () => {
    if (!accessibilityEnabled) {
      Alert.alert(
        'Enable Auto-Detect',
        'Form Mitra needs accessibility access to detect when you are filling a form in another app. When a form is found, you will be notified to open the overlay.',
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
        <Text style={styles.logo}>Form Mitra</Text>
        <Text style={styles.subtitle}>Encrypted Document Overlay</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.cardTitle}>Auto-Detect Forms</Text>
              <Text style={styles.cardDesc}>
                {accessibilityEnabled
                  ? 'Active — notifies when form detected'
                  : 'Off — enable to auto-detect forms'}
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
            3. Form detected → notification appears{'\n'}
            4. Tap notification → purple FM bubble appears{'\n'}
            5. Tap bubble → half-screen overlay with your data{'\n'}
            6. Tap "Encrypt & Queue" to encrypt & queue for submit{'\n'}
            7. Tap "Save to Private Sandbox" to store encrypted file{'\n'}
            8. Pick files from file manager to encrypt & store
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vault Status</Text>
          <Text style={styles.cardBody}>
            Master key: {keyReady ? 'Ready' : 'Initializing...'}{'\n'}
            Overlay permission: {hasPermission ? 'Granted' : 'Not granted'}{'\n'}
            Auto-detect: {accessibilityEnabled ? 'Active' : 'Disabled'}{'\n'}
            Server: {serverOnline === null ? 'Checking...' : serverOnline ? 'Online' : 'Offline'}{'\n'}
            Pending queue: {pendingCount} blob(s)
            {sandboxStats ? `\nSandbox: ${sandboxStats.fileCount} files (${(sandboxStats.totalSize / 1024).toFixed(1)} KB)` : ''}
            {sandboxStats && sandboxStats.cacheCount > 0 ? `\nTemp cache: ${sandboxStats.cacheCount} file(s)` : ''}
          </Text>
        </View>

        {pickedFiles.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Picked Files ({pickedFiles.length})</Text>
            {pickedFiles.map((file, index) => (
              <Text key={index} style={styles.pickedFile}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </Text>
            ))}
          </View>
        )}

        {sandboxFiles.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Private Sandbox Files ({sandboxFiles.length})</Text>
            {sandboxFiles.map((file) => (
              <View key={file.id} style={styles.sandboxFileRow}>
                <View style={styles.sandboxFileInfo}>
                  <Text style={styles.sandboxFileName} numberOfLines={1}>
                    {file.originalName}
                  </Text>
                  <Text style={styles.sandboxFileMeta}>
                    {(file.size / 1024).toFixed(1)} KB | {file.mimeType}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.sandboxViewBtn, viewingFileId === file.id && styles.btnDisabled]}
                  onPress={() => handleViewFile(file)}
                  disabled={viewingFileId !== null}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sandboxViewText}>
                    {viewingFileId === file.id ? 'Decrypting...' : 'View'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sandboxDeleteBtn}
                  onPress={() => handleDeleteSandboxFile(file)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sandboxDeleteText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.sandboxHint}>
              View decrypts to a temp cache and deletes it when you return.
            </Text>
          </View>
        )}

        {pendingCount > 0 && (
          <TouchableOpacity
            style={[styles.btnFlush, flushing && styles.btnDisabled]}
            onPress={handleFlushQueue}
            disabled={flushing}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>
              {flushing ? 'Submitting...' : `Submit ${pendingCount} Pending`}
            </Text>
            <Text style={styles.btnSubtext}>Tap to select items to submit</Text>
          </TouchableOpacity>
        )}

        {pendingCount > 0 && (
          <TouchableOpacity
            style={styles.btnClear}
            onPress={handleClearStorage}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, styles.btnClearText]}>Clear Local Storage</Text>
          </TouchableOpacity>
        )}

        {sandboxStats && sandboxStats.fileCount > 0 && (
          <TouchableOpacity
            style={styles.btnClear}
            onPress={handleClearSandbox}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, styles.btnClearText]}>Clear Private Sandbox</Text>
          </TouchableOpacity>
        )}

        {sandboxStats && sandboxStats.cacheCount > 0 && (
          <TouchableOpacity
            style={styles.btnClear}
            onPress={handleClearCache}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, styles.btnClearText]}>Clear Temp Cache</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.btnPickFile}
          onPress={handlePickFile}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Pick Files to Encrypt</Text>
          <Text style={styles.btnSubtext}>Select files from file manager</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnFileManager}
          onPress={handleOpenFileManager}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Open File Manager</Text>
          <Text style={styles.btnSubtext}>Browse files directly</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btn}
          onPress={handleShowOverlay}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>
            {overlayVisible ? 'Refresh Overlay' : 'Show Overlay Now'}
          </Text>
        </TouchableOpacity>

        {overlayVisible && (
          <TouchableOpacity
            style={[styles.btn, styles.btnHide]}
            onPress={handleHideOverlay}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, styles.btnHideText]}>Stop Bubble</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.note}>
          Device: Android | E2EE Active
        </Text>
      </ScrollView>

      <Modal
        visible={submitPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSubmitPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Items to Submit</Text>
              <TouchableOpacity onPress={handleSelectAllBlobs}>
                <Text style={styles.selectAllText}>
                  {selectedBlobs.size === pendingBlobs.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              {selectedBlobs.size} of {pendingBlobs.length} selected
            </Text>
            <FlatList
              data={pendingBlobs}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.blobItem,
                    selectedBlobs.has(item.id) && styles.blobItemSelected,
                  ]}
                  onPress={() => handleToggleBlobSelection(item.id)}
                >
                  <View style={styles.blobInfo}>
                    <Text style={styles.blobId}>{item.id.substring(0, 8)}...</Text>
                    <Text style={styles.blobMeta}>
                      {item.fieldCount} fields | {item.sensitiveCount} sensitive
                    </Text>
                    <Text style={styles.blobTime}>
                      {new Date(item.storedAt).toLocaleString()}
                    </Text>
                  </View>
                  <View style={[
                    styles.checkbox,
                    selectedBlobs.has(item.id) && styles.checkboxSelected,
                  ]}>
                    {selectedBlobs.has(item.id) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No pending items</Text>
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSubmitPickerVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  selectedBlobs.size === 0 && styles.btnDisabled,
                ]}
                onPress={handleSubmitSelected}
                disabled={selectedBlobs.size === 0}
              >
                <Text style={styles.modalSubmitText}>
                  Submit {selectedBlobs.size} Selected
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  scroll: { flex: 1 },
  inner: { padding: 24, paddingBottom: 40 },
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
  pickedFile: {
    color: '#f59e0b', fontSize: 12, marginTop: 4,
    fontFamily: 'monospace',
  },
  sandboxFileRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    padding: 10, marginBottom: 8,
  },
  sandboxFileInfo: { flex: 1, marginRight: 8 },
  sandboxFileName: {
    color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: 'monospace',
  },
  sandboxFileMeta: { color: '#666', fontSize: 10, marginTop: 2 },
  sandboxViewBtn: {
    backgroundColor: '#3b82f6', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 14, marginRight: 8,
  },
  sandboxViewText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sandboxDeleteBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  sandboxDeleteText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  sandboxHint: { color: '#555', fontSize: 10, marginTop: 4 },
  btn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  btnPickFile: {
    backgroundColor: '#f59e0b', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  btnFileManager: {
    backgroundColor: '#8b5cf6', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  btnFlush: {
    backgroundColor: '#059669', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 12,
  },
  btnClear: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#666',
    borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginBottom: 12,
  },
  btnClearText: { color: '#888', fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
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
    padding: 24, maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  selectAllText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },
  modalSubtitle: { color: '#888', fontSize: 12, marginBottom: 16 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', padding: 20 },

  blobItem: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center',
  },
  blobItemSelected: {
    backgroundColor: 'rgba(59,130,246,0.2)', borderColor: '#3b82f6', borderWidth: 1,
  },
  blobInfo: { flex: 1 },
  blobId: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  blobMeta: { color: '#888', fontSize: 11, marginTop: 2 },
  blobTime: { color: '#666', fontSize: 10, marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: '#666', justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3b82f6', borderColor: '#3b82f6',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },

  modalActions: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12,
  },
  modalCancelBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCancelText: { color: '#aaa', fontSize: 15, fontWeight: '600' },
  modalSubmitBtn: {
    flex: 2, backgroundColor: '#059669', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  modalSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default App;
