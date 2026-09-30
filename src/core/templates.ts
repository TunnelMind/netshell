/**
 * Config template rendering.
 * Uses nunjucks for Jinja2-compatible rendering so network engineers
 * can write templates they already know from Ansible/Salt.
 * Pure: no Electron, no store. The caller looks the template up.
 */
import type { ConfigTemplate } from '../types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nunjucks = require('nunjucks')

// Configure nunjucks with no filesystem loader (render strings only)
const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false })

export function renderTemplate(
  tmpl: ConfigTemplate | undefined,
  templateId: string,
  variables: Record<string, string | number | boolean>,
): { rendered: string } | { error: string } {
  if (!tmpl) return { error: `Template ${templateId} not found` }

  // Merge provided variables with defaults
  const context: Record<string, string | number | boolean> = {}
  for (const v of tmpl.variables) {
    context[v.name] = variables[v.name] ?? v.default ?? ''
  }
  // Caller-provided values override defaults
  Object.assign(context, variables)

  try {
    const rendered = env.renderString(tmpl.template, context)
    return { rendered }
  } catch (e: unknown) {
    return { error: (e as Error).message }
  }
}
