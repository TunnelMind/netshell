/**
 * GitOps drift detection — compares running device configs against
 * intended-state files checked into a local git repo.
 * Uses simple-git for repo operations, diff package for comparison.
 */
import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { diffLines } from 'diff'
import { IPC } from '../../types'
import { load, save } from '../store'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const simpleGit = require('simple-git')

export function registerGitopsHandlers(): void {
  ipcMain.handle(IPC.GITOPS_PULL, async (_event, repoPath?: string) => {
    const dir = repoPath || load().settings.gitRepoPath
    if (!dir || !fs.existsSync(dir)) throw new Error('Git repo path not configured or not found')

    const git = simpleGit(dir)
    const result = await git.pull()
    return {
      summary: result.summary,
      files: result.files,
      created: result.created,
      deleted: result.deleted,
    }
  })

  ipcMain.handle(IPC.GITOPS_DRIFT_CHECK, async (event, params: {
    sessionId: string
    sessionName: string
    runningConfig: string   // running config text (pulled from device via SSH)
    repoPath?: string
    branch?: string
  }) => {
    const settings = load().settings
    const dir = params.repoPath || settings.gitRepoPath
    if (!dir || !fs.existsSync(dir)) throw new Error('Git repo path not configured')

    const git = simpleGit(dir)
    const branch = params.branch || settings.gitBranch || 'main'

    // Find intended config file — search for file matching session name
    const safeSearch = params.sessionName.replace(/[^a-z0-9-_.]/gi, '')
    const candidates = [
      path.join(dir, `${safeSearch}.conf`),
      path.join(dir, `${safeSearch}.cfg`),
      path.join(dir, `${safeSearch}.txt`),
      path.join(dir, 'configs', `${safeSearch}.conf`),
      path.join(dir, 'configs', `${safeSearch}.cfg`),
    ]

    let intendedContent = ''
    let intendedFile = ''
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        intendedContent = fs.readFileSync(c, 'utf8')
        intendedFile = c
        break
      }
    }

    if (!intendedContent) {
      // Try git show on branch
      try {
        for (const ext of ['.conf', '.cfg', '.txt']) {
          try {
            intendedContent = await git.show([`${branch}:${safeSearch}${ext}`])
            intendedFile = `${branch}:${safeSearch}${ext}`
            break
          } catch {}
        }
      } catch {}
    }

    if (!intendedContent) {
      return { error: `No intended config found for "${params.sessionName}" in repo ${dir}`, diff: [] }
    }

    const diffResult = diffLines(intendedContent, params.runningConfig, { ignoreWhitespace: true })
    const hasDrift = diffResult.some(d => d.added || d.removed)

    const result = {
      sessionId: params.sessionId,
      sessionName: params.sessionName,
      intendedFile,
      ts: Date.now(),
      hasDrift,
      addedLines: diffResult.filter(d => d.added).reduce((n, d) => n + (d.count ?? 0), 0),
      removedLines: diffResult.filter(d => d.removed).reduce((n, d) => n + (d.count ?? 0), 0),
      diff: diffResult,
    }

    if (!event.sender.isDestroyed()) event.sender.send(IPC.GITOPS_DRIFT_RESULT, result)
    return result
  })

  ipcMain.handle(IPC.GITOPS_COMMIT, async (_event, params: {
    repoPath?: string
    message: string
    files: string[]
  }) => {
    const dir = params.repoPath || load().settings.gitRepoPath
    if (!dir) throw new Error('Git repo path not configured')

    const git = simpleGit(dir)
    await git.add(params.files)
    const result = await git.commit(params.message)
    return { commit: result.commit, summary: result.summary }
  })
}
