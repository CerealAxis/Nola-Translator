import { BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, join, relative, isAbsolute } from 'node:path'
import { runSandboxCommand, sandboxStatus } from './agent-sandbox'
import type { AgentActivity, AgentProject, AgentSkill, AgentWorkspaceSnapshot, SubagentDefinition, WorkspaceAction } from '../shared/agent-workspace'

/** Only directories explicitly selected through the native dialog become project roots. */
export class AgentWorkspace {
  private projects: AgentProject[] = []
  private selected: string | null = null
  private disabledSkills = new Set<string>()
  private subagents: SubagentDefinition[] = []
  private activity: AgentActivity[] = []
  private initialized?: Promise<void>
  private saves: Promise<void> = Promise.resolve()
  constructor(private readonly directory: string) {}
  private load() {
    return this.initialized ??= (async () => {
      try {
        const data = JSON.parse(await readFile(join(this.directory, 'workspace.json'), 'utf8'))
        this.projects = Array.isArray(data.projects) ? data.projects : []
        this.selected = data.selected ?? null
        this.disabledSkills = new Set(data.disabledSkills ?? [])
        this.subagents = data.subagents ?? []
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    })()
  }
  private save() {
    const content = JSON.stringify({ projects: this.projects, selected: this.selected, disabledSkills: [...this.disabledSkills], subagents: this.subagents })
    return this.saves = this.saves.catch(() => undefined).then(async () => {
      await mkdir(this.directory, { recursive: true })
      await writeFile(join(this.directory, 'workspace.json'), content, 'utf8')
    })
  }
  async project() { await this.load(); return this.projects.find(project => project.id === this.selected) }
  async skills(): Promise<AgentSkill[]> {
    const project = await this.project()
    if (!project) return []
    const result: AgentSkill[] = []
    for (const folder of ['.agents/skills', '.claude/skills']) {
      const root = join(project.path, folder)
      for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) continue
        const path = join(root, entry.name, 'SKILL.md')
        try {
          const content = await this.readProjectFile(path, 64000, project.id)
          result.push({ name: content.match(/^name:\s*["']?([^\r\n"']+)/m)?.[1] ?? entry.name,
            description: content.match(/^description:\s*["']?([^\r\n"']+)/m)?.[1] ?? '', path, enabled: !this.disabledSkills.has(path) })
        } catch { /* Unreadable or out-of-project skill links are not advertised. */ }
      }
    }
    return result
  }
  async readProjectFile(path: string, limit = 64000, expectedProjectId?: string) {
    const project = await this.project()
    if (!project) throw new Error('Select a project first')
    if (expectedProjectId && project.id !== expectedProjectId) throw new Error('Selected project changed')
    const resolved = await realpath(isAbsolute(path) ? path : join(project.path, path))
    const rel = relative(await realpath(project.path), resolved)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('File outside selected project')
    if ((await stat(resolved)).size > limit) throw new Error('File too large')
    return readFile(resolved, 'utf8')
  }
  async listProjectFiles(path: string, expectedProjectId?: string) {
    const project = await this.project()
    if (!project) throw new Error('Select a project first')
    if (expectedProjectId && project.id !== expectedProjectId) throw new Error('Selected project changed')
    const resolved = await realpath(isAbsolute(path) ? path : join(project.path, path))
    const rel = relative(await realpath(project.path), resolved)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Directory outside selected project')
    return (await readdir(resolved, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200)
      .map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'link' : 'file' }))
  }
  async definitions() { await this.load(); return this.subagents.filter(agent => agent.enabled) }
  async canUseTerminal() { return (await sandboxStatus()).available }
  record(activity: AgentActivity) {
    const previous = this.activity.find(item => item.id === activity.id)
    this.activity = [...this.activity.filter(item => item.id !== activity.id), { ...activity, at: previous?.at ?? activity.at }].slice(-80)
  }
  async snapshot(): Promise<AgentWorkspaceSnapshot> {
    await this.load()
    return { projects: this.projects, selectedProject: this.selected, skills: await this.skills(), subagents: this.subagents,
      sandbox: await sandboxStatus(), activity: this.activity }
  }
  async action(action: WorkspaceAction, owner?: BrowserWindow) {
    await this.load()
    if (action.action === 'addProject') {
      const options = { properties: ['openDirectory'] as ['openDirectory'] }
      const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
      if (!result.canceled && result.filePaths[0]) {
        const path = await realpath(result.filePaths[0])
        let project = this.projects.find(item => item.path === path)
        if (!project) { project = { id: randomUUID(), path, name: basename(path) }; this.projects.push(project) }
        this.selected = project.id
      }
    } else if (action.action === 'selectProject') {
      if (action.id && !this.projects.some(project => project.id === action.id)) throw new Error('Unknown project')
      this.selected = action.id
    } else if (action.action === 'skill') {
      if (!(await this.skills()).some(skill => skill.path === action.path)) throw new Error('Unknown skill')
      if (action.enabled) this.disabledSkills.delete(action.path); else this.disabledSkills.add(action.path)
    } else if (action.action === 'subagent') {
      if (this.subagents.length >= 12 && !this.subagents.some(item => item.id === action.agent.id)) throw new Error('Too many subagents')
      this.subagents = [...this.subagents.filter(item => item.id !== action.agent.id), action.agent]
    } else if (action.action === 'removeSubagent') this.subagents = this.subagents.filter(item => item.id !== action.id)
    if (action.action !== 'snapshot') await this.save()
    return this.snapshot()
  }
  async terminal(project: AgentProject, command: string, signal: AbortSignal): Promise<string> {
    const id = randomUUID()
    const activity: AgentActivity = { id, kind: 'terminal', name: project.name, input: command, status: 'running', at: Date.now() }
    this.record(activity)
    try {
      const result = await runSandboxCommand(project.path, command, signal)
      this.record({ ...activity, output: result.output, status: result.exitCode === 0 ? 'complete' : 'failed' })
      return JSON.stringify(result)
    } catch (error) {
      this.record({ ...activity, output: String(error).slice(0, 2000), status: 'failed' }); throw error
    }
  }
}
