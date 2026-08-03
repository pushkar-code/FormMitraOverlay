import { NativeModules, NativeEventEmitter } from 'react-native';

const { OverlayModule } = NativeModules;

let emitter: NativeEventEmitter | null = null;

if (OverlayModule) {
  emitter = new NativeEventEmitter(OverlayModule);
}

export interface OverlayShowData {
  fields: string;
}

export interface FormApp {
  packageName: string;
  appName: string;
}

export interface OverlayEvent {
  status: string;
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

  getInstalledFormApps(): Promise<FormApp[]> {
    if (!OverlayModule?.getInstalledFormApps) {
      return Promise.resolve([]);
    }
    return OverlayModule.getInstalledFormApps();
  },

  splitScreen(targetPackage: string): void {
    OverlayModule?.splitScreen?.(targetPackage);
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
};

export default NativeOverlay;
