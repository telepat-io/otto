import type { SiteRecipeBundle } from '../types.js';
import { checkLoginRecipe } from './checkLogin.js';
import { getFeedRecipe } from './getFeed.js';
import { gotoLoginRecipe } from './gotoLogin.js';

export const redditRecipes: SiteRecipeBundle = {
  site: 'reddit.com',
  checkLogin: checkLoginRecipe,
  gotoLogin: gotoLoginRecipe,
  recipes: [getFeedRecipe],
};
