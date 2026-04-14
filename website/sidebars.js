/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['overview', 'installation', 'quickstart']
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'architecture',
        'pairing-auth',
        'command-authoring',
        'controller-implementation',
        'agent-automation',
        'listener-development',
        'use-cases',
        'troubleshooting-advanced',
        'controller-troubleshooting-decision-tree',
        'command-authoring-templates',
        'requestid-correlation-runbook'
      ]
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'cli-reference',
        'error-codes',
        'configuration',
        'relay-api',
        'snippets',
        'protocol',
        'commands',
        'extension-runtime',
        'relay-operations',
        'logging-debugging',
        'tab-lock-model',
        'tab-management',
        'faq'
      ]
    },
    {
      type: 'category',
      label: 'Technical',
      items: ['security', 'testing']
    },
    {
      type: 'category',
      label: 'Contributing',
      items: ['development', 'releasing-and-docs-deploy']
    }
  ]
};
