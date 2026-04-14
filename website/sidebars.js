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
      items: [
        'guides/architecture',
        'guides/pairing-auth',
        'guides/command-authoring',
        'guides/controller-implementation',
        'guides/listener-development',
        'guides/use-cases',
        'guides/troubleshooting-advanced'
      ]
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/cli-reference',
        'reference/error-codes',
        'reference/configuration',
        'reference/relay-api',
        'reference/protocol',
        'reference/commands',
        'reference/extension-runtime',
        'reference/relay-operations',
        'reference/logging-debugging',
        'reference/tab-lock-model',
        'reference/tab-management',
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
