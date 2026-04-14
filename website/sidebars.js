/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['getting-started/overview', 'getting-started/installation', 'getting-started/quickstart']
    },
    {
      type: 'category',
      label: 'Guides',
      items: ['guides/architecture', 'guides/pairing-auth']
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/cli-reference',
        'reference/protocol',
        'reference/commands',
        'reference/extension-runtime',
        'reference/relay-operations',
        'reference/logging-debugging',
        'reference/faq'
      ]
    },
    {
      type: 'category',
      label: 'Technical',
      items: ['technical/security', 'technical/testing']
    },
    {
      type: 'category',
      label: 'Contributing',
      items: ['contributing/development', 'contributing/releasing-and-docs-deploy']
    }
  ]
};
