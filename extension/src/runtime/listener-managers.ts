import { createNetworkInterceptListenerManager } from './network-intercept/listener.js';
import { createTabAudioKeepaliveManager } from './tab-audio-keepalive.js';

type ChromeLike = typeof chrome;

type NetworkManager = ReturnType<typeof createNetworkInterceptListenerManager>;
type TabAudioKeepaliveManager = ReturnType<typeof createTabAudioKeepaliveManager>;

let networkManager: NetworkManager | null = null;
let tabAudioKeepaliveManager: TabAudioKeepaliveManager | null = null;

export function getNetworkInterceptListenerManager(chromeApi: ChromeLike): NetworkManager {
  if (!networkManager) {
    networkManager = createNetworkInterceptListenerManager(chromeApi);
  }
  return networkManager;
}

export function getTabAudioKeepaliveManager(chromeApi: ChromeLike): TabAudioKeepaliveManager {
  if (!tabAudioKeepaliveManager) {
    tabAudioKeepaliveManager = createTabAudioKeepaliveManager(chromeApi);
  }
  return tabAudioKeepaliveManager;
}

export function resetListenerManagersForTest(): void {
  networkManager = null;
  tabAudioKeepaliveManager = null;
}
