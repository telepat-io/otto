import { createNetworkInterceptListenerManager } from './network-intercept-listener.js';

type ChromeLike = typeof chrome;

type NetworkManager = ReturnType<typeof createNetworkInterceptListenerManager>;

let networkManager: NetworkManager | null = null;

export function getNetworkInterceptListenerManager(chromeApi: ChromeLike): NetworkManager {
  if (!networkManager) {
    networkManager = createNetworkInterceptListenerManager(chromeApi);
  }
  return networkManager;
}
