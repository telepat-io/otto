import { createNetworkInterceptListenerManager } from './network-intercept/listener.js';
import { createDebuggerFocusEmulationManager } from './debugger-focus-emulation.js';

type ChromeLike = typeof chrome;

type NetworkManager = ReturnType<typeof createNetworkInterceptListenerManager>;
type DebuggerFocusEmulationManager = ReturnType<typeof createDebuggerFocusEmulationManager>;

let networkManager: NetworkManager | null = null;
const debuggerFocusEmulationManagers = new WeakMap<ChromeLike, DebuggerFocusEmulationManager>();

export function getNetworkInterceptListenerManager(chromeApi: ChromeLike): NetworkManager {
  if (!networkManager) {
    networkManager = createNetworkInterceptListenerManager(chromeApi);
  }
  return networkManager;
}

export function getDebuggerFocusEmulationManager(chromeApi: ChromeLike): DebuggerFocusEmulationManager {
  const existing = debuggerFocusEmulationManagers.get(chromeApi);
  if (existing) {
    return existing;
  }

  const created = createDebuggerFocusEmulationManager(chromeApi);
  debuggerFocusEmulationManagers.set(chromeApi, created);
  return created;
}

export function resetListenerManagersForTest(): void {
  networkManager = null;
}
