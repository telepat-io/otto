import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './check-login.js';
import { getFrontPageCommand } from './get-front-page.js';
import { gotoLoginCommand } from './goto-login.js';

export const hackerNewsCommands: SiteCommandBundle = {
  site: 'news.ycombinator.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getFrontPageCommand],
};
