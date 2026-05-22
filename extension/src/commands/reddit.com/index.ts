import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './check-login.js';
import { commentOnPostCommand } from './comment-on-post.js';
import { getChatMessagesCommand } from './get-chat-messages.js';
import { getPostsCommand } from './get-posts.js';
import { getUserInfoCommand } from './get-user-info.js';
import { gotoLoginCommand } from './goto-login.js';
import { sendChatMessageCommand } from './send-chat-message.js';

export const redditCommands: SiteCommandBundle = {
  site: 'reddit.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getPostsCommand, getUserInfoCommand, sendChatMessageCommand, getChatMessagesCommand, commentOnPostCommand],
};
