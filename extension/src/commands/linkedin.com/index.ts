import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './check-login.js';
import { commentOnPostCommand } from './comment-on-post.js';
import { getFeedCommand } from './get-feed.js';
import { gotoLoginCommand } from './goto-login.js';

export const linkedinCommands: SiteCommandBundle = {
  site: 'linkedin.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getFeedCommand, commentOnPostCommand],
};
