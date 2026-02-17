import type { Managers } from '../Managers'
import type { GameSnapshotV1 } from './types'

export class SnapshotService {
	constructor(
		private managers: Managers,
		private contentId?: string
	) {}

	serialize(): GameSnapshotV1 {
		return {
			version: 1,
			contentId: this.contentId,
			savedAtSimMs: this.managers.simulation.getSimulationTimeMs(),
			state: {
				simulation: this.managers.simulation.serialize(),
				time: this.managers.time.serialize(),
				players: this.managers.players.serialize(),
				inventory: this.managers.inventory.serialize(),
				mapObjects: this.managers.mapObjects.serialize(),
				loot: this.managers.loot.serialize(),
				buildings: this.managers.buildings.serialize(),
				storage: this.managers.storage.serialize(),
				reservations: this.managers.reservations.serialize(),
				population: this.managers.population.serialize(),
				movement: this.managers.movement.serialize(),
				needs: this.managers.needs.serialize(),
				actions: this.managers.actions.serialize(),
				behaviour: this.managers.behaviour.serialize(),
				work: this.managers.work.serialize(),
				npc: this.managers.npc.serialize(),
				quests: this.managers.quest.serialize(),
				dialogue: this.managers.dialogue.serialize(),
				flags: this.managers.flags.serialize(),
				affinity: this.managers.affinity.serialize(),
				reputation: this.managers.reputation.serialize(),
				resourceNodes: this.managers.resourceNodes.serialize(),
				roads: this.managers.roads.serialize(),
				cityCharter: this.managers.cityCharter.serialize(),
				trade: this.managers.trade.serialize(),
				triggers: this.managers.trigger.serialize(),
				scheduler: this.managers.scheduler.serialize()
			}
		}
	}

	deserialize(snapshot: GameSnapshotV1): void {
		this.managers.simulation.stop()

		this.resetManagers()

		this.managers.simulation.deserialize(snapshot.state.simulation)
		this.managers.time.deserialize(snapshot.state.time)
		this.managers.mapObjects.deserialize(snapshot.state.mapObjects)
		this.managers.loot.deserialize(snapshot.state.loot)
		this.managers.buildings.deserialize(snapshot.state.buildings)
		this.managers.storage.deserialize(snapshot.state.storage)
		this.managers.reservations.deserialize(snapshot.state.reservations)
		this.managers.roads.deserialize(snapshot.state.roads)
		if (snapshot.state.trade) {
			this.managers.trade.deserialize(snapshot.state.trade)
		} else {
			this.managers.trade.reset?.()
		}
		this.managers.population.deserialize(snapshot.state.population)
		this.managers.movement.deserialize(snapshot.state.movement)
		this.managers.needs.deserialize(snapshot.state.needs)
		this.managers.work.deserialize(snapshot.state.work)
		this.managers.behaviour.deserialize(snapshot.state.behaviour)
		this.managers.actions.setTime(this.managers.simulation.getSimulationTimeMs())
		this.managers.actions.deserialize(snapshot.state.actions)
		this.managers.work.resumeAfterDeserialize()
		this.managers.players.deserialize(snapshot.state.players)
		this.managers.inventory.deserialize(snapshot.state.inventory)
		this.managers.npc.deserialize(snapshot.state.npc)
		this.managers.quest.deserialize(snapshot.state.quests)
		this.managers.dialogue.deserialize(snapshot.state.dialogue)
		this.managers.flags.deserialize(snapshot.state.flags)
		this.managers.affinity.deserialize(snapshot.state.affinity)
		if (snapshot.state.reputation) {
			this.managers.reputation.deserialize(snapshot.state.reputation)
		} else if (snapshot.state.trade?.reputation) {
			this.managers.reputation.deserialize({ reputation: snapshot.state.trade.reputation })
		} else {
			this.managers.reputation.reset?.()
		}
		this.managers.resourceNodes.deserialize(snapshot.state.resourceNodes)
		this.managers.trigger.deserialize(snapshot.state.triggers)
		this.managers.scheduler.deserialize(snapshot.state.scheduler)
		if (snapshot.state.cityCharter) {
			this.managers.cityCharter.deserialize(snapshot.state.cityCharter)
		} else {
			this.managers.cityCharter.reset?.()
		}

		this.managers.simulation.start()
	}

	private resetManagers(): void {
		this.managers.players.reset?.()
		this.managers.inventory.reset?.()
		this.managers.mapObjects.reset?.()
		this.managers.loot.reset?.()
		this.managers.buildings.reset?.()
		this.managers.storage.reset?.()
		this.managers.population.reset?.()
		this.managers.movement.reset?.()
		this.managers.needs.reset?.()
		this.managers.actions.reset?.()
		this.managers.behaviour.reset?.()
		this.managers.work.reset?.()
		this.managers.npc.reset?.()
		this.managers.quest.reset?.()
		this.managers.dialogue.reset?.()
		this.managers.flags.reset?.()
		this.managers.affinity.reset?.()
		this.managers.reputation.reset?.()
		this.managers.resourceNodes.reset?.()
		this.managers.roads.reset?.()
		this.managers.trigger.reset?.()
		this.managers.scheduler.reset?.()
		this.managers.cityCharter.reset?.()
		this.managers.trade.reset?.()
		this.managers.reservations.reset?.()
		this.managers.time.reset?.()
		this.managers.simulation.reset?.()
	}
}
