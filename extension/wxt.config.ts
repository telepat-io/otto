import { defineConfig } from 'wxt';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  outDir: 'output',
  manifestVersion: 3,
  manifest: {
    name: 'Otto',
    description: 'Ottomate Everything - remote browser automation node',
    version: packageJson.version,
    permissions: ['storage', 'tabs', 'tabGroups', 'scripting', 'offscreen', 'alarms', 'debugger'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      {
        resources: [
          'distill-libs/readability.js',
          'distill-libs/dom-distiller.js',
          'distill-libs/turndown.js',
          'distill-libs/turndown-plugin-gfm.js',
        ],
        matches: ['<all_urls>'],
      },
    ],
    action: {
      default_title: 'Otto Node',
      default_popup: 'popup.html',
    },
    options_page: 'options.html',
  },
});
