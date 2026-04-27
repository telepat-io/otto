const githubOwner = process.env.GITHUB_OWNER || 'telepat-io';
const githubRepo = process.env.GITHUB_REPO || 'otto';
const localMode = process.env.DOCS_LOCAL === 'true';

const url = localMode ? 'http://localhost' : process.env.DOCS_URL || 'https://docs.telepat.io';
const baseUrl = localMode ? '/' : process.env.DOCS_BASE_URL || '/otto/';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Otto Docs',
  tagline: 'Secure remote browser automation for controller, relay, and extension node.',
  url,
  baseUrl,
  organizationName: githubOwner,
  projectName: githubRepo,
  deploymentBranch: process.env.GH_PAGES_BRANCH || 'gh-pages',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  favicon: 'img/favicon.svg',
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: `https://github.com/${githubOwner}/${githubRepo}/tree/main/`
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ],
  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true
    },
    navbar: {
      title: 'Otto',
      logo: {
        alt: 'Otto Logo',
        src: 'img/logo.svg'
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs'
        },
        {
          to: '/cli',
          label: 'CLI Reference',
          position: 'left'
        },
        {
          to: '/security',
          label: 'Technical',
          position: 'left'
        },
        {
          to: '/for-agents',
          label: 'For Agents',
          position: 'left'
        },
        {
          href: `https://github.com/${githubOwner}/${githubRepo}`,
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/overview'
            },
            {
              label: 'CLI Reference',
              to: '/cli'
            }
          ]
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Repository',
              href: `https://github.com/${githubOwner}/${githubRepo}`
            }
          ]
        },
        {
          title: 'More',
          items: [
            {
              label: 'Contributing',
              to: '/development'
            },
            {
              label: 'GitHub',
              href: `https://github.com/${githubOwner}/${githubRepo}`
            }
          ]
        }
      ],
      copyright: `Copyright ${new Date().getFullYear()} Otto contributors. Built with Docusaurus.`
    },
    prism: {
      additionalLanguages: ['bash', 'sql', 'powershell']
    }
  }
};

module.exports = config;
