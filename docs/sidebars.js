/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'getting-started',
    'annotations',
    'import',
    {
      type: 'category',
      label: 'Storage',
      items: ['storage/setup', 'storage/migration'],
    },
    {
      type: 'category',
      label: 'AI Setup',
      items: ['ai/setup'],
    },
    {
      type: 'category',
      label: 'Managing Your Library',
      items: [
        'library/managing-documents',
        'library/tags',
        'library/collections',
        'library/citations',
      ],
    },
    'ai-chat',
    {
      type: 'category',
      label: 'Wiki Layer',
      link: { type: 'doc', id: 'wiki/index' },
      items: ['wiki/obsidian-setup'],
    },
    'settings',
    'shortcuts',
  ],
};

export default sidebars;
