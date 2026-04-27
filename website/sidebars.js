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
        'command-authoring-templates',
        'controller-implementation',
        'listener-development',
        'use-cases',
        'troubleshooting-advanced',
        'controller-troubleshooting-decision-tree',
        'requestid-correlation-runbook'
      ]
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        {
          type: 'category',
          label: 'CLI Reference',
          collapsed: false,
          items: [
            'cli/index',
            'cli/start',
            'cli/setup',
            'cli/config',
            'cli/extension',
            'cli/pairing',
            'cli/client',
            'cli/commands',
            'cli/logs',
            'cli/listener'
          ]
        },
        'error-codes',
        'configuration',
        'relay-api',
        'protocol',
        'commands',
        'extension-runtime',
        'relay-operations',
        'logging-debugging',
        'tab-lock-model',
        'tab-management',
        'snippets',
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
    },
    {
      type: 'category',
      label: 'For Agents',
      items: [
        'for-agents/index',
        'for-agents/automation-guide',
        'for-agents/command-development'
      ]
    }
  ]
};
