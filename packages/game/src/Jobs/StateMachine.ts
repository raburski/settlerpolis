import type { Settler, SettlerState } from '../Population/types'
import type { JobAssignment, JobPhase } from './types'
import type { JobTaskContext } from './TaskContext'
import type { TaskRegistry } from './TaskRegistry'

export class JobStateMachine {
\tconstructor(
\t\tprivate context: JobTaskContext,
\t\tprivate registry: TaskRegistry
\t) {}

\tpublic dispatchPhase(job: JobAssignment, phase: JobPhase): void {
\t\tconst settler = this.context.getSettler(job)
\t\tif (!settler) {
\t\t\tthis.context.cancelJob(job.jobId, 'settler_missing')
\t\t\treturn
\t\t}

\t\tconst definition = this.registry.getDefinition(job.jobType)
\t\tconst handler = definition.dispatch?.[phase]
\t\tif (handler) {
\t\t\thandler(job, settler)
\t\t}
\t}

\tpublic handleSettlerArrival(settler: Settler): SettlerState | null {
\t\tconst jobId = settler.stateContext.jobId
\t\tif (!jobId) {
\t\t\treturn null
\t\t}

\t\tconst job = this.context.getJob(jobId)
\t\tif (!job) {
\t\t\treturn null
\t\t}

\t\tjob.lastProgressAtMs = this.context.getSimulationTimeMs()

\t\tconst definition = this.registry.getDefinition(job.jobType)
\t\tconst handler = job.phase ? definition.arrival?.[job.phase] : undefined
\t\tif (!handler) {
\t\t\treturn null
\t\t}

\t\treturn handler(job, settler)
\t}
}
