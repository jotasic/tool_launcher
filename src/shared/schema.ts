import { z } from 'zod'
import { DEFAULT_SETTINGS, type Program, type Settings } from './types'

const openSpecSchema = z.object({
  mode: z.enum(['none', 'url', 'url-from-log', 'path']),
  value: z.string().optional(),
  logPattern: z.string().optional(),
  autoOpenOnStart: z.boolean().default(false),
})

const processSpecSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  order: z.number().int(),
  startDelayMs: z.number().int().nonnegative().optional(),
})

const gitSpecSchema = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().optional(),
  autoPullOnStart: z.boolean().optional(),
})

export const programSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workingDir: z.string().min(1),
  git: gitSpecSchema.optional(),
  processes: z.array(processSpecSchema).min(1),
  open: openSpecSchema.optional(),
})

export const settingsSchema = z.object({
  logBufferLines: z.number().int().positive().default(DEFAULT_SETTINGS.logBufferLines),
  logToFile: z.boolean().default(DEFAULT_SETTINGS.logToFile),
  defaultLogPattern: z.string().default(DEFAULT_SETTINGS.defaultLogPattern),
  theme: z.enum(['light', 'dark', 'system']).default(DEFAULT_SETTINGS.theme),
})

export function parseProgram(data: unknown): Program {
  return programSchema.parse(data) as Program
}

export function parseSettings(data: unknown): Settings {
  return settingsSchema.parse(data ?? {})
}
