import { Platform } from 'react-native';

// Robust browser API shim for Native platforms (Android / iOS)
// Prevents "Cannot read property 'hash' of undefined" and unhandled window/DOM crashes
if (Platform.OS !== 'web') {
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : window);

  if (typeof g.window === 'undefined') {
    g.window = g;
  }

  const mockLocation = {
    hash: '',
    pathname: '/',
    search: '',
    href: '',
    origin: '',
    host: '',
    hostname: '',
    port: '',
    protocol: 'https:',
    reload: () => {},
    replace: () => {},
    assign: () => {},
  };

  if (!g.window.location) {
    g.window.location = mockLocation;
  }
  if (!g.location) {
    g.location = mockLocation;
  }

  if (!g.window.history) {
    g.window.history = {
      state: null,
      length: 1,
      replaceState: () => {},
      pushState: () => {},
      back: () => {},
      forward: () => {},
      go: () => {},
    };
  }

  if (!g.window.addEventListener) {
    g.window.addEventListener = () => {};
    g.window.removeEventListener = () => {};
  }
  if (!g.addEventListener) {
    g.addEventListener = () => {};
    g.removeEventListener = () => {};
  }

  if (!g.window.dispatchEvent) {
    g.window.dispatchEvent = () => true;
  }
  if (!g.dispatchEvent) {
    g.dispatchEvent = () => true;
  }
}
