import { NativeModules, NativeEventEmitter } from 'react-native';

const { OverlayModule } = NativeModules;

let emitter: NativeEventEmitter | null = null;

if (OverlayModule) {
  emitter = new NativeEventEmitter(OverlayModule);
}

export interface OverlayShowData {
  fields: string;
}

export interface OverlayEvent {
  status: string;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface PickFilesResult {
  files: PickedFile[];
  count: number;
}

const NativeOverlay = {
  isAvailable(): boolean {
    return !!OverlayModule;
  },

  checkPermission(): Promise<boolean> {
    if (!OverlayModule?.checkPermission) {
      return Promise.resolve(false);
    }
    return OverlayModule.checkPermission();
  },

  requestPermission(): void {
    OverlayModule?.requestPermission?.();
  },

  showOverlay(data: OverlayShowData): void {
    OverlayModule?.showOverlay?.(data);
  },

  hideOverlay(): void {
    OverlayModule?.hideOverlay?.();
  },

  isShowing(): Promise<boolean> {
    if (!OverlayModule?.isShowing) {
      return Promise.resolve(false);
    }
    return OverlayModule.isShowing();
  },

  onOverlayShown(callback: (event: OverlayEvent) => void) {
    return emitter?.addListener('onOverlayShown', callback) ?? { remove: () => {} };
  },

  onOverlayHidden(callback: (event: OverlayEvent) => void) {
    return emitter?.addListener('onOverlayHidden', callback) ?? { remove: () => {} };
  },

  onOverlayError(callback: (event: { message: string }) => void) {
    return emitter?.addListener('onOverlayError', callback) ?? { remove: () => {} };
  },

  startBubbleService(fieldsJson: string): void {
    OverlayModule?.startBubbleService?.(fieldsJson);
  },

  showOverlayFromService(fieldsJson: string): void {
    OverlayModule?.showOverlayFromService?.(fieldsJson);
  },

  stopBubbleService(): void {
    OverlayModule?.stopBubbleService?.();
  },

  isAccessibilityEnabled(): Promise<boolean> {
    if (!OverlayModule?.isAccessibilityEnabled) return Promise.resolve(false);
    return OverlayModule.isAccessibilityEnabled();
  },

  openAccessibilitySettings(): void {
    OverlayModule?.openAccessibilitySettings?.();
  },

  refreshNotification(): void {
    OverlayModule?.refreshNotification?.();
  },

  pickFile(): Promise<PickedFile> {
    if (!OverlayModule?.pickFile) {
      return Promise.reject(new Error('File picker not available'));
    }
    return OverlayModule.pickFile();
  },

  pickFiles(): Promise<PickFilesResult> {
    if (!OverlayModule?.pickFiles) {
      return Promise.reject(new Error('File picker not available'));
    }
    return OverlayModule.pickFiles();
  },

  openFileManager(): Promise<boolean> {
    if (!OverlayModule?.openFileManager) {
      return Promise.reject(new Error('File manager not available'));
    }
    return OverlayModule.openFileManager();
  },

  openDecryptedFile(path: string, mimeType: string): Promise<boolean> {
    if (!OverlayModule?.openDecryptedFile) {
      return Promise.reject(new Error('File opener not available'));
    }
    return OverlayModule.openDecryptedFile(path, mimeType);
  },

  shareDecryptedFile(path: string, mimeType: string): Promise<boolean> {
    if (!OverlayModule?.shareDecryptedFile) {
      return Promise.reject(new Error('File sharer not available'));
    }
    return OverlayModule.shareDecryptedFile(path, mimeType);
  },
};

export default NativeOverlay;
