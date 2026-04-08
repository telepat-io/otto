import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './checkLogin.js';
import { getChatMessagesCommand } from './getChatMessages.js';
import { getFeedCommand } from './getFeed.js';
import { getUserInfoCommand } from './getUserInfo.js';
import { gotoLoginCommand } from './gotoLogin.js';
import { sendChatMessageCommand } from './sendChatMessage.js';

export const redditCommands: SiteCommandBundle = {
  site: 'reddit.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getFeedCommand, getUserInfoCommand, sendChatMessageCommand, getChatMessagesCommand],
};
