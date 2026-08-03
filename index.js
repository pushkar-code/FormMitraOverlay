/**
 * @format
 */

import 'react-native-get-random-values';
import { install } from 'react-native-quick-crypto';
install();

import { AppRegistry } from 'react-native';
import App from './App';
import OverlayContent from './src/overlay/OverlayContent';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerComponent('OverlayContent', () => OverlayContent);
