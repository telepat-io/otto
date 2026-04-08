import { createNetworkInterceptListenerManager } from './network-intercept-listener.js';
import { createRedditChatListenerManager } from './reddit-chat-listener.js';

type ChromeLike = typeof chrome;

type NetworkManager = ReturnType<typeof createNetworkInterceptListenerManager>;
type RedditChatManager = ReturnType<typeof createRedditChatListenerManager>;

let networkManager: NetworkManager | null = null;
let redditChatManager: RedditChatManager | null = null;

export function getNetworkInterceptListenerManager(chromeApi: ChromeLike): NetworkManager {
  if (!networkManager) {
    networkManager = createNetworkInterceptListenerManager(chromeApi);
  }
  return networkManager;
}

export function getRedditChatListenerManager(chromeApi: ChromeLike): RedditChatManager {
  if (!redditChatManager) {
    redditChatManager = createRedditChatListenerManager(chromeApi);
  }
  return redditChatManager;
}
