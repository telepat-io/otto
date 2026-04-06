import type { SiteRecipeBundle } from '../types.js';
import { checkLoginRecipe } from './checkLogin.js';
import { getChatMessagesRecipe } from './getChatMessages.js';
import { getFeedRecipe } from './getFeed.js';
import { getUserInfoRecipe } from './getUserInfo.js';
import { gotoLoginRecipe } from './gotoLogin.js';
import { sendChatMessageRecipe } from './sendChatMessage.js';

export const redditRecipes: SiteRecipeBundle = {
  site: 'reddit.com',
  checkLogin: checkLoginRecipe,
  gotoLogin: gotoLoginRecipe,
  recipes: [getFeedRecipe, getUserInfoRecipe, sendChatMessageRecipe, getChatMessagesRecipe],
};
