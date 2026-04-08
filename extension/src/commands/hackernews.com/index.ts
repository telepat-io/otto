import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './checkLogin.js';
import { getFrontPageCommand } from './getFrontPage.js';
import { gotoLoginCommand } from './gotoLogin.js';

export const hackerNewsCommands: SiteCommandBundle = {
  site: 'news.ycombinator.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getFrontPageCommand],
};
