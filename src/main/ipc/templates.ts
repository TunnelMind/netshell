/**
 * Config template CRUD + render.
 * Rendering (nunjucks) lives in src/core/templates.ts.
 */
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { ConfigTemplate } from '../../types'
import { load, save } from '../store'
import { renderTemplate } from '../../core/templates'

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
    const tmpl = load().templates.find(t => t.id === params.templateId)
    return renderTemplate(tmpl, params.templateId, params.variables)
  })
}
