import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'output',
  manifestVersion: 3,
  manifest: {
    name: 'Otto',
    description: 'Ottomate Everything - remote browser automation node',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'tabGroups', 'scripting', 'offscreen', 'alarms'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Otto Node',
      default_popup: 'popup.html',
    },
    options_page: 'options.html',
  },
});
