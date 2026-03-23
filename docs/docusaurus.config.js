// @ts-check
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ScholarLib Documentation',
  tagline: 'Private Academic Reference Manager',
  favicon: 'img/favicon.ico',

  url: 'https://pourmousavi.github.io',
  baseUrl: '/ScholarLib/docs/',

  organizationName: 'pourmousavi',
  projectName: 'ScholarLib',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import("@easyops-cn/docusaurus-search-local").PluginOptions} */
      ({
        hashed: true,
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'ScholarLib Docs',
        logo: {
          alt: 'ScholarLib Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://pourmousavi.github.io/ScholarLib/',
            label: 'Back to App',
            position: 'right',
          },
          {
            href: 'https://github.com/pourmousavi/ScholarLib',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Getting Started',
                to: '/',
              },
              {
                label: 'AI Setup',
                to: '/ai/setup',
              },
              {
                label: 'Keyboard Shortcuts',
                to: '/shortcuts',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/pourmousavi/ScholarLib',
              },
              {
                label: 'Back to App',
                href: 'https://pourmousavi.github.io/ScholarLib/',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} ScholarLib. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
