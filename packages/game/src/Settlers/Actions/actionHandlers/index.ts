import type { ActionHandler } from './types'
import { SettlerActionType } from '../types'
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

export const ActionHandlers: Record<SettlerActionType, ActionHandler> = {
	[SettlerActionType.Move]: MoveActionHandler,
	[SettlerActionType.FollowPath]: FollowPathActionHandler,
	[SettlerActionType.Wait]: WaitActionHandler,
	[SettlerActionType.Construct]: ConstructActionHandler,
	[SettlerActionType.BuildRoad]: BuildRoadActionHandler,
	[SettlerActionType.PickupTool]: PickupToolActionHandler,
	[SettlerActionType.PickupLoot]: PickupLootActionHandler,
	[SettlerActionType.WithdrawStorage]: WithdrawStorageActionHandler,
	[SettlerActionType.DeliverStorage]: DeliverStorageActionHandler,
	[SettlerActionType.DeliverConstruction]: DeliverConstructionActionHandler,
	[SettlerActionType.HarvestNode]: HarvestNodeActionHandler,
	[SettlerActionType.HuntNpc]: HuntNpcActionHandler,
	[SettlerActionType.Produce]: ProduceActionHandler,
	[SettlerActionType.Plant]: PlantActionHandler,
	[SettlerActionType.ChangeProfession]: ChangeProfessionActionHandler,
	[SettlerActionType.ChangeHome]: ChangeHomeActionHandler,
	[SettlerActionType.Consume]: ConsumeActionHandler,
	[SettlerActionType.Sleep]: SleepActionHandler,
	[SettlerActionType.ProspectNode]: ProspectNodeActionHandler
}

export * from './types'
