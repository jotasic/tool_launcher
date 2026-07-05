import type { AppContext } from './app-context'
import type { Program } from '../shared/types'

/**
 * autoPullOnStart 처리를 포함한 프로그램 시작. IPC 핸들러·트레이 메뉴·
 * 런처 시작 시 자동 시작이 모두 이 경로를 쓴다. pull 출력은 프로그램
 * 로그 패널에 system 라인으로 흘려보낸다.
 */
export async function startProgramWithPull(ctx: AppContext, program: Program): Promise<void> {
  const { logs, git, processes } = ctx
  if (program.git?.autoPullOnStart) {
    const sys = (text: string): void =>
      logs.append({
        programId: program.id,
        processName: 'git',
        stream: 'system',
        text,
        ts: Date.now()
      })
    sys('git pull 실행 중...')
    try {
      await git.pull(program.workingDir, sys)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sys(`git pull 실패: ${msg} — 무시하고 시작합니다`)
    }
  }
  await processes.start(program)
}
