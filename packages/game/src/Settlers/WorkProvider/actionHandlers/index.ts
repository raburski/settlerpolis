import type { ActionHandler } from './types'
import { WorkActionType } from '../types'
import { MoveActionHandler } from './move'
import { FollowPathActionHandler } from './followPath'
import { WaitActionHandler } from './wait'
import { ConsumeActionHandler } from './consume'
import { SleepActionHandler } from './sleep'
import { ConstructActionHandler } from './construct'
import { BuildRoadActionHandler } from './buildRoad'
import { PickupToolActionHandler } from './pickupTool'
import { PickupLootActionHandler } from './pickupLoot'
import { WithdrawStorageActionHandler } from './withdrawStorage'
import { DeliverStorageActionHandler } from './deliverStorage'
import { DeliverConstructionActionHandler } from './deliverConstruction'
import { HarvestNodeActionHandler } from './harvestNode'
import { HuntNpcActionHandler } from './huntNpc'
import { ProduceActionHandler } from './produce'
import { PlantActionHandler } from './plant'
import { ChangeProfessionActionHandler } from './changeProfession'
import { ChangeHomeActionHandler } from './changeHome'
import { ProspectNodeActionHandler } from './prospectNode'

export const ActionHandlers: Record<WorkActionType, ActionHandler> = {
	[WorkActionType.Move]: MoveActionHandler,
	[WorkActionType.FollowPath]: FollowPathActionHandler,
	[WorkActionType.Wait]: WaitActionHandler,
	[WorkActionType.Construct]: ConstructActionHandler,
	[WorkActionType.BuildRoad]: BuildRoadActionHandler,
	[WorkActionType.PickupTool]: PickupToolActionHandler,
	[WorkActionType.PickupLoot]: PickupLootActionHandler,
	[WorkActionType.WithdrawStorage]: WithdrawStorageActionHandler,
	[WorkActionType.DeliverStorage]: DeliverStorageActionHandler,
	[WorkActionType.DeliverConstruction]: DeliverConstructionActionHandler,
	[WorkActionType.HarvestNode]: HarvestNodeActionHandler,
	[WorkActionType.HuntNpc]: HuntNpcActionHandler,
	[WorkActionType.Produce]: ProduceActionHandler,
	[WorkActionType.Plant]: PlantActionHandler,
	[WorkActionType.ChangeProfession]: ChangeProfessionActionHandler,
	[WorkActionType.ChangeHome]: ChangeHomeActionHandler,
	[WorkActionType.Consume]: ConsumeActionHandler,
	[WorkActionType.Sleep]: SleepActionHandler,
	[WorkActionType.ProspectNode]: ProspectNodeActionHandler
}

export * from './types'
