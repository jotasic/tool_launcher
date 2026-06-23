import { useProgramsStore } from '../../stores/programs'
import { ProgramRow } from './ProgramRow'
import { ProgramForm } from './ProgramForm'
import { Button } from '@/components/ui/button'

export function ProgramList() {
  const programs = useProgramsStore((s) => s.programs)
  return (
    <div>
      <div className="mb-3"><ProgramForm trigger={<Button>+ 프로그램 추가</Button>} /></div>
      {programs.length === 0 ? (
        <p className="text-gray-500">등록된 프로그램이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {programs.map((p) => <ProgramRow key={p.id} program={p} />)}
        </ul>
      )}
    </div>
  )
}
