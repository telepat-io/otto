import type { SiteCommand } from '../types.js';
import type { PageDeepQuerySelector } from '../../runtime/page-dom-query.js';

const REDDIT_LOGIN_URL = 'https://www.reddit.com/login/';

export const gotoLoginCommand: SiteCommand = {
  metadata: {
    site: 'reddit.com',
    id: 'gotoLogin',
    displayName: 'Go To Reddit Login',
    description: 'Navigates the current tab to the Reddit login page.',
    tags: ['auth', 'builtin'],
    requiresAuth: false,
    inputFields: [],
  },
  async execute(ctx) {
    await ctx.navigateTab(REDDIT_LOGIN_URL);

    const cookieBannerDismissed = await ctx.executeScriptWithDomHelpers(
      async () => {
        const wait = (ms: number) => new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

        const pageWindow = window as Window & {
          __ottoDeepQuerySelector?: PageDeepQuerySelector;
        };
        const deepQuerySelector = pageWindow.__ottoDeepQuerySelector;
        if (typeof deepQuerySelector !== 'function') {
          return false;
        }

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const banner = deepQuerySelector(document, 'reddit-cookie-banner');
          const button = banner instanceof HTMLElement
            ? deepQuerySelector(banner.shadowRoot ?? banner, 'button')
            : null;
          if (button instanceof HTMLButtonElement) {
            button.click();
            return true;
          }
          await wait(150);
        }

        return false;
      },
      [],
    );

    return {
      loginUrl: REDDIT_LOGIN_URL,
      cookieBannerDismissed: Boolean(cookieBannerDismissed),
    };
  },
};
