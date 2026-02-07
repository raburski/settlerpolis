type TilePosition = { x: number, y: number }

export interface RouteSegment {
	index: number
	startTileIndex: number
	endTileIndex: number
	tiles: TilePosition[]
}

export interface DeliveryRecipient<TPayload> {
	recipientId: string
	tile: TilePosition
	payload: TPayload
}

export interface SegmentRecipientAssignment<TPayload> {
	recipientId: string
	distanceTiles: number
	payload: TPayload
}

const tileDistance = (a: TilePosition, b: TilePosition): number => {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export const buildRouteSegments = (
	routeTiles: TilePosition[],
	strideTiles: number
): RouteSegment[] => {
	if (routeTiles.length === 0) {
		return []
	}
	if (routeTiles.length === 1) {
		return [{
			index: 0,
			startTileIndex: 0,
			endTileIndex: 0,
			tiles: [routeTiles[0]]
		}]
	}

	const stride = Math.max(1, Math.floor(strideTiles))
	const segments: RouteSegment[] = []
	let startTileIndex = 0
	let segmentDir = {
		x: routeTiles[1].x - routeTiles[0].x,
		y: routeTiles[1].y - routeTiles[0].y
	}

	const pushSegment = (endTileIndex: number) => {
		segments.push({
			index: segments.length,
			startTileIndex,
			endTileIndex,
			tiles: routeTiles.slice(startTileIndex, endTileIndex + 1)
		})
	}

	for (let i = 1; i < routeTiles.length - 1; i += 1) {
		const current = routeTiles[i]
		const next = routeTiles[i + 1]
		const nextDir = {
			x: next.x - current.x,
			y: next.y - current.y
		}
		const segmentLength = i - startTileIndex
		const directionChanged = nextDir.x !== segmentDir.x || nextDir.y !== segmentDir.y
		const reachedStride = segmentLength >= stride
		if (!directionChanged && !reachedStride) {
			continue
		}

		pushSegment(i)
		startTileIndex = i
		segmentDir = nextDir
	}

	pushSegment(routeTiles.length - 1)
	return segments
}

export const assignRecipientsToRouteSegments = <TPayload>(
	segments: RouteSegment[],
	recipients: Array<DeliveryRecipient<TPayload>>,
	searchRadiusTiles: number
): Array<Array<SegmentRecipientAssignment<TPayload>>> => {
	const radius = Math.max(0, Math.floor(searchRadiusTiles))
	const assignments: Array<Array<SegmentRecipientAssignment<TPayload>>> = Array.from(
		{ length: segments.length },
		() => []
	)

	for (const recipient of recipients) {
		let bestIndex = -1
		let bestDistance = Number.POSITIVE_INFINITY

		for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
			const segment = segments[segmentIndex]
			let minDistanceForSegment = Number.POSITIVE_INFINITY
			for (const tile of segment.tiles) {
				const distance = tileDistance(tile, recipient.tile)
				if (distance < minDistanceForSegment) {
					minDistanceForSegment = distance
				}
			}

			if (minDistanceForSegment > radius) {
				continue
			}

			if (minDistanceForSegment < bestDistance) {
				bestDistance = minDistanceForSegment
				bestIndex = segmentIndex
			}
		}

		if (bestIndex < 0) {
			continue
		}

		assignments[bestIndex].push({
			recipientId: recipient.recipientId,
			distanceTiles: bestDistance,
			payload: recipient.payload
		})
	}

	for (const segmentAssignments of assignments) {
		segmentAssignments.sort((a, b) => {
			if (a.distanceTiles !== b.distanceTiles) {
				return a.distanceTiles - b.distanceTiles
			}
			return a.recipientId.localeCompare(b.recipientId)
		})
	}

	return assignments
}
