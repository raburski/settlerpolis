export enum WorkPolicyResultType {
	Block = 'block',
	Enqueue = 'enqueue'
}

export enum WorkPolicyPhase {
	BeforeStep = 'before_step',
	NoStep = 'no_step',
	WaitStep = 'wait_step'
}
