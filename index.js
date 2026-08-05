/**
 * @format
 */

if (typeof TextDecoder === 'undefined') {
  const decodeUTF8 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i];
      if (b < 0x80) {
        str += String.fromCharCode(b);
        i += 1;
      } else if (b < 0xe0) {
        str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
        i += 2;
      } else if (b < 0xf0) {
        str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
        i += 3;
      } else {
        const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
        str += String.fromCodePoint(cp);
        i += 4;
      }
    }
    return str;
  };
  global.TextDecoder = class TextDecoder {
    decode(input) { return decodeUTF8(input); }
  };
}

if (typeof TextEncoder === 'undefined') {
  const encodeUTF8 = (str) => {
    const chars = [];
    for (let i = 0; i < str.length; i++) {
      let cp = str.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
        cp = ((cp - 0xd800) << 10) + (str.charCodeAt(i + 1) - 0xdc00) + 0x10000;
        i += 1;
      }
      if (cp < 0x80) {
        chars.push(cp);
      } else if (cp < 0x800) {
        chars.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      } else if (cp < 0x10000) {
        chars.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        chars.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }
    return new Uint8Array(chars);
  };
  global.TextEncoder = class TextEncoder {
    encode(input) { return encodeUTF8(input || ''); }
  };
}

import 'react-native-get-random-values';
import { install } from 'react-native-quick-crypto';
install();

import { AppRegistry } from 'react-native';
import App from './App';
import OverlayContent from './src/overlay/OverlayContent';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerComponent('OverlayContent', () => OverlayContent);
