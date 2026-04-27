import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './check-login.js';
import { getSearchResultsCommand } from './get-search-results.js';
import { gotoLoginCommand } from './goto-login.js';

export const googleCommands: SiteCommandBundle = {
  site: 'google.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getSearchResultsCommand],
};
