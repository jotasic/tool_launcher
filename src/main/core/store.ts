import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseProgram, parseSettings } from '../../shared/schema'
import type { Program, Settings } from '../../shared/types'

export class Store {
  private programsFile: string
  private settingsFile: string

  constructor(
    baseDir: string,
    private idgen: () => string = () => randomUUID(),
  ) {
    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
    this.programsFile = join(baseDir, 'programs.json')
    this.settingsFile = join(baseDir, 'settings.json')
  }

  private readPrograms(): Program[] {
    if (!existsSync(this.programsFile)) return []
    const raw = JSON.parse(readFileSync(this.programsFile, 'utf-8')) as unknown[]
    return raw.map((r) => parseProgram(r))
  }

  private writePrograms(programs: Program[]): void {
    writeFileSync(this.programsFile, JSON.stringify(programs, null, 2), 'utf-8')
  }

  listPrograms(): Program[] {
    return this.readPrograms()
  }

  createProgram(input: Omit<Program, 'id'>): Program {
    const program = parseProgram({ ...input, id: this.idgen() })
    const all = this.readPrograms()
    all.push(program)
    this.writePrograms(all)
    return program
  }

  updateProgram(program: Program): Program {
    const validated = parseProgram(program)
    const all = this.readPrograms().map((p) => (p.id === validated.id ? validated : p))
    this.writePrograms(all)
    return validated
  }

  deleteProgram(id: string): void {
    this.writePrograms(this.readPrograms().filter((p) => p.id !== id))
  }

  exportPrograms(): string {
    return JSON.stringify(this.readPrograms(), null, 2)
  }

  importPrograms(json: string): Program[] {
    const parsed = (JSON.parse(json) as unknown[]).map((r) => parseProgram(r))
    this.writePrograms(parsed)
    return parsed
  }

  getSettings(): Settings {
    if (!existsSync(this.settingsFile)) return parseSettings({})
    return parseSettings(JSON.parse(readFileSync(this.settingsFile, 'utf-8')))
  }

  setSettings(s: Settings): Settings {
    const validated = parseSettings(s)
    writeFileSync(this.settingsFile, JSON.stringify(validated, null, 2), 'utf-8')
    return validated
  }
}
