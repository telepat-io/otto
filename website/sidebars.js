/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  docsSidebar: [
    'index',
    'features',
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
        'guides/architecture',
        'guides/pairing-auth',
        'guides/command-authoring',
        'guides/command-authoring-templates',
        'guides/controller-implementation',
        'guides/listener-development',
        'guides/use-cases',
        'guides/content-extraction',
        'guides/troubleshooting-advanced',
        'guides/controller-troubleshooting-decision-tree',
        'guides/requestid-correlation-runbook'
      ]
    },
    {
      type: 'category',
      label: 'SDK',
      items: [
        'sdk/index',
        'sdk/getting-started',
        'sdk/api-reference',
        'sdk/examples'
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
        'for-agents/command-development',
        'for-agents/mcp-server',
        'for-agents/agent-setup',
        'for-agents/skills'
      ]
    }
  ]
};
