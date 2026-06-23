import { useProgramsStore } from '../../stores/programs'
import { ProgramRow } from './ProgramRow'

export function ProgramList() {
  const programs = useProgramsStore((s) => s.programs)
  if (programs.length === 0) {
    return <p className="text-gray-500">등록된 프로그램이 없습니다. (추가 폼은 M2)</p>
  }
  return (
    <ul className="space-y-2">
      {programs.map((p) => <ProgramRow key={p.id} program={p} />)}
    </ul>
  )
}
