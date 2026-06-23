// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useProgramsStore } from './programs'
import type { ProgramRuntime } from '../../../shared/types'

beforeEach(() => {
  useProgramsStore.setState({ programs: [], runtimes: {} })
})

describe('useProgramsStore.applyRuntime', () => {
  it('stores runtime keyed by programId', () => {
    const rt: ProgramRuntime = { programId: 'a', status: 'running' }
    useProgramsStore.getState().applyRuntime(rt)
    expect(useProgramsStore.getState().runtimes['a']?.status).toBe('running')
  })
})
