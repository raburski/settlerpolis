export enum SettlerActionFailureReason {
	UnknownAction = 'unknown_action',
	MovementFailed = 'movement_failed',
	MovementCancelled = 'movement_cancelled',
	LootPickupFailed = 'loot_pickup_failed',
	StorageWithdrawFailed = 'storage_withdraw_failed',
	StorageDeliverFailed = 'storage_deliver_failed',
	ConstructionDeliverFailed = 'construction_deliver_failed',
	HarvestFailed = 'harvest_failed',
	HomeMoveFailed = 'home_move_failed',
	BuildingNotFound = 'building_not_found',
	PlantFailed = 'plant_failed',
	NpcMissing = 'npc_missing',
	WrongTarget = 'wrong_target',
	OutOfRange = 'out_of_range'
}

export const isMovementActionFailureReason = (
	reason: SettlerActionFailureReason
): boolean => {
	return reason === SettlerActionFailureReason.MovementFailed
		|| reason === SettlerActionFailureReason.MovementCancelled
}

export enum NeedPlanningFailureReason {
	NoFoodSource = 'no_food_source',
	NoHome = 'no_home',
	UnknownNeedType = 'unknown_need_type',
	PlanFailed = 'plan_failed',
	ActionSystemBusy = 'action_system_busy',
	FoodBuildingMissing = 'food_building_missing',
	FoodUnavailable = 'food_unavailable',
	FoodReserved = 'food_reserved',
	AmenityFull = 'amenity_full'
}

export type NeedPlanFailureReason = NeedPlanningFailureReason | SettlerActionFailureReason
