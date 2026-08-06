import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import {
  decrypt,
  maskAadhaar,
  maskPhone,
  maskValue,
  EncryptedPayload,
} from '../crypto/vault';
import { secureQueue } from '../crypto/secureQueue';
import { storeEncryptedFields } from '../storage/encryptedStore';
import {
  storeFileData,
  listFiles,
  removeFile,
  getStorageStats,
  decryptToCache,
  deleteDecryptedFile,
  StoredFile,
} from '../storage/fileStore';
import NativeOverlay from '../native/NativeOverlay';
import { secureWipe } from '../utils/sanitizer';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface EncryptedField {
  label: string;
  value: EncryptedPayload;
  source: string;
  sensitive: boolean;
}

export default function OverlayContent(props: any) {
  const fieldsRaw = props.fields;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState<Record<string, boolean>>({});
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const [storing, setStoring] = useState(false);
  const [savedAsFile, setSavedAsFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);

  const decryptedRef = useRef<Record<string, string>>({});
  const fieldsDataRef = useRef<EncryptedField[]>([]);

  let fields: EncryptedField[] = [];
  try {
    if (typeof fieldsRaw === 'string') {
      fields = JSON.parse(fieldsRaw);
    } else if (fieldsRaw && typeof fieldsRaw === 'object') {
      fields = Array.isArray(fieldsRaw) ? fieldsRaw : Object.values(fieldsRaw);
    }
  } catch (e) {
    fields = [];
  }

  fieldsDataRef.current = fields;

  useEffect(() => {
    secureQueue.init();
    loadFileList();
  }, []);

  useEffect(() => {
    return () => {
      secureWipe(decryptedRef);
      setDecryptedValues({});
      setExpanded(null);
    };
  }, []);

  const loadFileList = async () => {
    try {
      const files = await listFiles();
      setStoredFiles(files);
      setFileCount(files.length);
    } catch {}
  };

  const handleEncryptAndStore = useCallback(async () => {
    if (fields.length === 0 || storing) return;

    setStoring(true);
    try {
      const plainFields: Array<{ label: string; value: string; source: string; sensitive: boolean }> =
        fields.map((f) => ({
          label: f.label,
          value: f.value?.ciphertext ? '[encrypted]' : String(f.value),
          source: f.source,
          sensitive: f.sensitive,
        }));

      await storeEncryptedFields(plainFields);
      await secureQueue.enqueue(plainFields);

      setEncrypted(true);

      secureWipe(decryptedRef);
      setDecryptedValues({});
      setExpanded(null);
    } catch (e) {
    } finally {
      setStoring(false);
    }
  }, [fields, storing]);

  const handleSaveAsFile = useCallback(async () => {
    if (fields.length === 0 || savingFile) return;

    setSavingFile(true);
    try {
      const plainFields: Array<{ label: string; value: string; source: string; sensitive: boolean }> =
        fields.map((f) => ({
          label: f.label,
          value: f.value?.ciphertext ? '[encrypted]' : String(f.value),
          source: f.source,
          sensitive: f.sensitive,
        }));

      const jsonData = JSON.stringify(plainFields, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `stronghold_${timestamp}.json`;

      await storeFileData(jsonData, fileName, 'application/json');
      await loadFileList();

      setSavedAsFile(true);
      setEncrypted(true);

      secureWipe(decryptedRef);
      setDecryptedValues({});
      setExpanded(null);
    } catch (e) {
    } finally {
      setSavingFile(false);
    }
  }, [fields, savingFile]);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    try {
      await deleteDecryptedFile(fileId);
      await removeFile(fileId);
      await loadFileList();
    } catch {}
  }, []);

  const handleViewFile = useCallback(async (file: StoredFile) => {
    if (viewingFileId) return;

    setViewingFileId(file.id);
    try {
      const cachePath = await decryptToCache(file.id);
      await NativeOverlay.openDecryptedFile(cachePath, file.mimeType);
    } catch (e) {
      await deleteDecryptedFile(file.id);
    } finally {
      setViewingFileId(null);
    }
  }, [viewingFileId]);

  const handleShareFile = useCallback(async (file: StoredFile) => {
    if (viewingFileId) return;

    setViewingFileId(file.id);
    try {
      const cachePath = await decryptToCache(file.id);
      await NativeOverlay.shareDecryptedFile(cachePath, file.mimeType);
    } catch (e) {
      await deleteDecryptedFile(file.id);
    } finally {
      setViewingFileId(null);
    }
  }, [viewingFileId]);

  const handleToggle = useCallback(
    async (label: string, encryptedValue: EncryptedPayload) => {
      if (expanded === label) {
        setExpanded(null);
        return;
      }

      setExpanded(label);

      if (decryptedValues[label] || decryptedRef.current[label]) {
        return;
      }

      setDecrypting((prev) => ({ ...prev, [label]: true }));
      try {
        const plaintext = await decrypt(encryptedValue);
        decryptedRef.current[label] = plaintext;
        setDecryptedValues((prev) => ({ ...prev, [label]: plaintext }));
      } catch (e) {
        setDecryptedValues((prev) => ({
          ...prev,
          [label]: '[decryption failed]',
        }));
      } finally {
        setDecrypting((prev) => ({ ...prev, [label]: false }));
      }
    },
    [expanded, decryptedValues]
  );

  const handleCollapse = useCallback(() => {
    secureWipe(decryptedRef);
    setDecryptedValues({});
    setExpanded(null);
    setCollapsed(true);
  }, []);

  const getMaskedDisplay = (field: EncryptedField): string => {
    const raw = decryptedValues[field.label] || '';
    if (!raw) {
      if (field.label.toLowerCase().includes('aadhaar')) return 'XXXX-XXXX-XXXX';
      if (field.label.toLowerCase().includes('phone') || field.label.toLowerCase().includes('mobile'))
        return 'XXXXXXXXXX';
      return '********';
    }
    if (field.label.toLowerCase().includes('aadhaar')) return maskAadhaar(raw);
    if (field.label.toLowerCase().includes('phone') || field.label.toLowerCase().includes('mobile'))
      return maskPhone(raw);
    return maskValue(raw);
  };

  if (fields.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>StrongHold</Text>
          <Text style={styles.subtitle}>No data available</Text>
        </View>
      </View>
    );
  }

  if (collapsed) {
    return (
      <TouchableOpacity
        style={styles.collapsedBar}
        onPress={() => setCollapsed(false)}
        activeOpacity={0.8}
      >
        <Text style={styles.collapsedText}>StrongHold ({fields.length} fields)</Text>
        <Text style={styles.collapsedHint}>tap to expand</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>StrongHold</Text>
          <Text style={styles.badge}>ENCRYPTED</Text>
          {encrypted && <Text style={styles.storedBadge}>STORED</Text>}
          {savedAsFile && <Text style={styles.fileBadge}>FILE</Text>}
        </View>
        <TouchableOpacity onPress={handleCollapse} style={styles.collapseBtn}>
          <Text style={styles.collapseBtnText}>_</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {fields.map((field, index) => {
          const fieldKey = field.label || `field_${index}`;
          return (
            <TouchableOpacity
              key={fieldKey}
              style={styles.fieldRow}
              onPress={() => handleToggle(fieldKey, field.value)}
              activeOpacity={0.7}
            >
              <View style={styles.fieldHeader}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                {field.source ? (
                  <Text style={styles.fieldSource}>from {field.source}</Text>
                ) : null}
              </View>

              <View style={styles.fieldValue}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {expanded === fieldKey && decryptedValues[fieldKey]
                    ? decryptedValues[fieldKey]
                    : getMaskedDisplay(field)}
                </Text>
                {decrypting[fieldKey] && (
                  <Text style={styles.decrypting}>decrypting...</Text>
                )}
              </View>

              {field.sensitive ? (
                <View style={styles.sensitiveBadge}>
                  <Text style={styles.sensitiveText}>SENSITIVE</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {storedFiles.length > 0 && (
        <View style={styles.filesSection}>
          <Text style={styles.filesTitle}>Private Sandbox ({fileCount} files)</Text>
          <View style={styles.fileList}>
            {storedFiles.slice(-3).map((file) => (
              <View key={file.id} style={styles.fileItem}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.originalName}</Text>
                  <Text style={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</Text>
                </View>
                <TouchableOpacity
                  style={[styles.fileViewBtn, viewingFileId === file.id && styles.btnDisabled]}
                  onPress={() => handleViewFile(file)}
                  disabled={viewingFileId !== null}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fileViewText}>
                    {viewingFileId === file.id ? 'Decrypting...' : 'View'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.fileShareBtn, viewingFileId === file.id && styles.btnDisabled]}
                  onPress={() => handleShareFile(file)}
                  disabled={viewingFileId !== null}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fileShareText}>Attach</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.fileDeleteBtn}
                  onPress={() => handleDeleteFile(file.id)}
                >
                  <Text style={styles.fileDeleteText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.encryptBtn, storing && styles.btnDisabled]}
          onPress={handleEncryptAndStore}
          disabled={storing || encrypted}
          activeOpacity={0.8}
        >
          <Text style={styles.encryptBtnText}>
            {storing ? 'Encrypting...' : encrypted ? 'Encrypted & Queued' : 'Encrypt & Queue'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fileBtn, savingFile && styles.btnDisabled]}
          onPress={handleSaveAsFile}
          disabled={savingFile}
          activeOpacity={0.8}
        >
          <Text style={styles.fileBtnText}>
            {savingFile ? 'Saving...' : 'Save to Private Sandbox'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          AES-256-GCM | Sandbox: encrypted at rest | Cache: temporary decrypt
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(12, 12, 24, 0.95)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    maxHeight: Dimensions.get('window').height * 0.75,
    width: SCREEN_WIDTH,
    elevation: 9999,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#666',
    fontSize: 12,
  },
  badge: {
    color: '#22c55e',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  storedBadge: {
    color: '#3b82f6',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(59,130,246,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fileBadge: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  collapseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapseBtnText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    padding: 12,
    paddingBottom: 4,
  },
  fieldRow: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  fieldSource: {
    color: '#555',
    fontSize: 10,
    fontStyle: 'italic',
  },
  fieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldValueText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'monospace',
    letterSpacing: 1,
    flex: 1,
  },
  decrypting: {
    color: '#ffcc00',
    fontSize: 10,
    marginLeft: 8,
  },
  sensitiveBadge: {
    marginTop: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  sensitiveText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '700',
  },
  filesSection: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filesTitle: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  fileList: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 8,
  },
  fileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  fileInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileName: {
    color: '#ccc',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  fileSize: {
    color: '#666',
    fontSize: 9,
    marginTop: 2,
  },
  fileDeleteBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileViewBtn: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  fileShareBtn: {
    backgroundColor: 'rgba(5,150,105,0.2)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  fileShareText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '700',
  },
  fileViewText: {
    color: '#3b82f6',
    fontSize: 10,
    fontWeight: '700',
  },
  fileDeleteText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
  },
  actionRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  encryptBtn: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  encryptBtnText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  fileBtn: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  fileBtnText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  footer: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerText: {
    color: '#444',
    fontSize: 10,
    textAlign: 'center',
  },
  collapsedBar: {
    backgroundColor: 'rgba(12, 12, 24, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    width: SCREEN_WIDTH,
    elevation: 9999,
  },
  collapsedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  collapsedHint: {
    color: '#555',
    fontSize: 11,
  },
});
