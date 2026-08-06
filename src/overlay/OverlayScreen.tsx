import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import NativeOverlay from '../native/NativeOverlay';
import {
  encrypt,
  decrypt,
  maskAadhaar,
  maskPhone,
  maskValue,
  EncryptedPayload,
} from '../crypto/vault';
import { generateAndStoreMasterKey } from '../crypto/keychain';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface FormField {
  label: string;
  value: string;
  source: string;
  sensitive: boolean;
}

interface OverlayScreenProps {
  visible: boolean;
  onClose: () => void;
  fields: FormField[];
}

export default function OverlayScreen({
  visible,
  onClose,
  fields,
}: OverlayScreenProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState<Record<string, boolean>>({});
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({});

  const slideAnim = React.useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleToggle = useCallback(
    async (label: string, encryptedValue: EncryptedPayload) => {
      if (expanded === label) {
        setExpanded(null);
        return;
      }

      setExpanded(label);

      if (decryptedValues[label]) return;

      setDecrypting((prev) => ({ ...prev, [label]: true }));
      try {
        const plaintext = await decrypt(encryptedValue);
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

  const getMaskedDisplay = (field: FormField): string => {
    const raw = decryptedValues[field.label] || field.value;
    if (field.label.toLowerCase().includes('aadhaar')) return maskAadhaar(raw);
    if (field.label.toLowerCase().includes('phone') || field.label.toLowerCase().includes('mobile'))
      return maskPhone(raw);
    return maskValue(raw);
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateX: slideAnim }] },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>StrongHold — Encrypted Overlay</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>X</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {fields.map((field) => (
          <TouchableOpacity
            key={field.label}
            style={styles.fieldRow}
            onPress={() => handleToggle(field.label, field.value as any)}
            activeOpacity={0.7}
          >
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <Text style={styles.fieldSource}>from {field.source}</Text>
            </View>

            <View style={styles.fieldValue}>
              <Text style={styles.fieldValueText}>
                {expanded === field.label && decryptedValues[field.label]
                  ? decryptedValues[field.label]
                  : getMaskedDisplay(field)}
              </Text>
              {decrypting[field.label] && (
                <Text style={styles.decrypting}>decrypting...</Text>
              )}
            </View>

            {field.sensitive && (
              <View style={styles.sensitiveBadge}>
                <Text style={styles.sensitiveText}>SENSITIVE</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          All data is AES-256-GCM encrypted. Tap to reveal.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 0,
    width: SCREEN_WIDTH * 0.85,
    maxHeight: Dimensions.get('window').height - 100,
    backgroundColor: 'rgba(15, 15, 25, 0.95)',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 9999,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,70,70,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ff4646',
    fontWeight: '700',
    fontSize: 14,
  },
  body: {
    padding: 12,
  },
  fieldRow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  fieldSource: {
    color: '#555',
    fontSize: 11,
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
  },
  decrypting: {
    color: '#ffcc00',
    fontSize: 11,
    marginLeft: 8,
  },
  sensitiveBadge: {
    marginTop: 6,
    backgroundColor: 'rgba(255, 70, 70, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  sensitiveText: {
    color: '#ff4646',
    fontSize: 9,
    fontWeight: '700',
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerText: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
  },
});
