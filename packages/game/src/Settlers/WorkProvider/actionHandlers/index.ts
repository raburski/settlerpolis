import type { ActionHandler } from './types'
import { WorkActionType } from '../types'
import { MoveActionHandler } from './move'
import { WaitActionHandler } from './wait'
import { ConstructActionHandler } from './construct'
import { PickupToolActionHandler } from './pickupTool'
import { PickupLootActionHandler } from './pickupLoot'
import { WithdrawStorageActionHandler } from './withdrawStorage'
import { DeliverStorageActionHandler } from './deliverStorage'
import { DeliverConstructionActionHandler } from './deliverConstruction'
import { HarvestNodeActionHandler } from './harvestNode'
import { ProduceActionHandler } from './produce'
import { PlantActionHandler } from './plant'
import { ChangeProfessionActionHandler } from './changeProfession'

export const ActionHandlers: Record<WorkActionType, ActionHandler> = {
	[WorkActionType.Move]: MoveActionHandler,
	[WorkActionType.Wait]: WaitActionHandler,
	[WorkActionType.Construct]: ConstructActionHandler,
	[WorkActionType.PickupTool]: PickupToolActionHandler,
	[WorkActionType.PickupLoot]: PickupLootActionHandler,
	[WorkActionType.WithdrawStorage]: WithdrawStorageActionHandler,
	[WorkActionType.DeliverStorage]: DeliverStorageActionHandler,
	[WorkActionType.DeliverConstruction]: DeliverConstructionActionHandler,
	[WorkActionType.HarvestNode]: HarvestNodeActionHandler,
	[WorkActionType.Produce]: ProduceActionHandler,
	[WorkActionType.Plant]: PlantActionHandler,
	[WorkActionType.ChangeProfession]: ChangeProfessionActionHandler
}

export * from './types'
