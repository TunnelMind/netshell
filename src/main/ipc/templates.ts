/**
 * Config template CRUD + render.
 * Uses nunjucks for Jinja2-compatible rendering so network engineers
 * can write templates they already know from Ansible/Salt.
 */
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { ConfigTemplate } from '../../types'
import { load, save } from '../store'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nunjucks = require('nunjucks')

// Configure nunjucks with no filesystem loader (render strings only)
const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false })

export function registerTemplateHandlers(): void {
  ipcMain.handle(IPC.TEMPLATES_GET_ALL, () => {
    return load().templates
  })

  ipcMain.handle(IPC.TEMPLATES_SAVE, (_event, template: ConfigTemplate) => {
    const data = load()
    if (!template.id) template.id = uuidv4()
    const idx = data.templates.findIndex(t => t.id === template.id)
    if (idx >= 0) data.templates[idx] = template
    else data.templates.push(template)
    save(data)
    return template
  })

  ipcMain.handle(IPC.TEMPLATES_DELETE, (_event, id: string) => {
    const data = load()
    data.templates = data.templates.filter(t => t.id !== id)
    save(data)
  })

  ipcMain.handle(IPC.TEMPLATES_RENDER, (_event, params: {
    templateId: string
    variables: Record<string, string | number | boolean>
  }) => {
    const data = load()
    const tmpl = data.templates.find(t => t.id === params.templateId)
    if (!tmpl) return { error: `Template ${params.templateId} not found` }

    // Merge provided variables with defaults
    const context: Record<string, string | number | boolean> = {}
    for (const v of tmpl.variables) {
      context[v.name] = params.variables[v.name] ?? v.default ?? ''
    }
    // Caller-provided values override defaults
    Object.assign(context, params.variables)

    try {
      const rendered = env.renderString(tmpl.template, context)
      return { rendered }
    } catch (e: unknown) {
      return { error: (e as Error).message }
    }
  })
}
