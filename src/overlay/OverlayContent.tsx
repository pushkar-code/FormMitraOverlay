import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
} from 'react-native';
import {
  decrypt,
  maskAadhaar,
  maskPhone,
  maskValue,
  EncryptedPayload,
} from '../crypto/vault';
import { getMasterKey } from '../crypto/keychain';

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

  const decryptedRef = useRef<Record<string, string>>({});

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

  useEffect(() => {
    return () => {
      Object.keys(decryptedRef.current).forEach((k) => {
        (decryptedRef.current as any)[k] = '';
      });
      decryptedRef.current = {};
    };
  }, []);

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
          <Text style={styles.title}>Form Mitra</Text>
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
        <Text style={styles.collapsedText}>Form Mitra ({fields.length} fields)</Text>
        <Text style={styles.collapsedHint}>tap to expand</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Form Mitra</Text>
          <Text style={styles.badge}>ENCRYPTED</Text>
        </View>
        <TouchableOpacity onPress={() => setCollapsed(true)} style={styles.collapseBtn}>
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

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          AES-256-GCM | Tap to reveal | Swipe down to collapse
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
    maxHeight: Dimensions.get('window').height * 0.7,
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
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
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
