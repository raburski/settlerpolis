import type { StepHandler } from './types'
import { WorkStepType } from '../types'
import { AcquireToolHandler } from './acquireTool'
import { ConstructHandler } from './construct'
import { HarvestHandler } from './harvest'
import { FishHandler } from './fish'
import { HuntHandler } from './hunt'
import { ProduceHandler } from './produce'
import { PlantHandler } from './plant'
import { BuildRoadHandler } from './buildRoad'
import { TransportHandler } from './transport'
import { MarketRunHandler } from './marketRun'
import { WaitHandler } from './wait'

export const StepHandlers: Record<WorkStepType, StepHandler> = {
	[WorkStepType.AcquireTool]: AcquireToolHandler,
	[WorkStepType.Construct]: ConstructHandler,
	[WorkStepType.Harvest]: HarvestHandler,
	[WorkStepType.Fish]: FishHandler,
	[WorkStepType.Hunt]: HuntHandler,
	[WorkStepType.Produce]: ProduceHandler,
	[WorkStepType.Plant]: PlantHandler,
	[WorkStepType.BuildRoad]: BuildRoadHandler,
	[WorkStepType.Transport]: TransportHandler,
	[WorkStepType.MarketRun]: MarketRunHandler,
	[WorkStepType.Wait]: WaitHandler
}

export * from './types'
