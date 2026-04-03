import type { SiteRecipeBundle } from '../types.js';
import { checkLoginRecipe } from './checkLogin.js';
import { getFrontPageRecipe } from './getFrontPage.js';
import { gotoLoginRecipe } from './gotoLogin.js';

export const hackerNewsRecipes: SiteRecipeBundle = {
  site: 'news.ycombinator.com',
  checkLogin: checkLoginRecipe,
  gotoLogin: gotoLoginRecipe,
  recipes: [getFrontPageRecipe],
};
