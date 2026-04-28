import YAML from 'yaml'

const FRONTMATTER_BOUNDARY = '---'

export function parseWikiMarkdown(markdown) {
  const text = String(markdown || '')
  if (!text.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return { frontmatter: {}, body: text }
  }

  const end = text.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1)
  if (end === -1) {
    return { frontmatter: {}, body: text }
  }

  const yamlText = text.slice(FRONTMATTER_BOUNDARY.length + 1, end)
  const body = text.slice(end + FRONTMATTER_BOUNDARY.length + 2)
  return {
    frontmatter: YAML.parse(yamlText) || {},
    body,
  }
}

export function stringifyWikiMarkdown(frontmatter, body = '') {
  const yamlText = YAML.stringify(frontmatter || {}).trimEnd()
  return `${FRONTMATTER_BOUNDARY}\n${yamlText}\n${FRONTMATTER_BOUNDARY}\n${String(body).replace(/^\n+/, '')}`
}

export function parseYamlFence(markdown, fenceName) {
  const text = String(markdown || '')
  const opener = `\`\`\`${fenceName}`
  const start = text.indexOf(opener)
  if (start === -1) return null

  const contentStart = text.indexOf('\n', start)
  if (contentStart === -1) return null

  const end = text.indexOf('\n```', contentStart + 1)
  if (end === -1) return null

  return YAML.parse(text.slice(contentStart + 1, end)) || null
}
