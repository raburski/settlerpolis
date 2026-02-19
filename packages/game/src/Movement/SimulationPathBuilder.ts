import type { Position } from '../types'

export interface SimulationPathData {
	path: Position[]
	renderTargetStepIndices: number[]
}

const rasterizeTileLine = (startX: number, startY: number, endX: number, endY: number): Array<{ x: number, y: number }> => {
	const points: Array<{ x: number, y: number }> = []
	let x = startX
	let y = startY
	const dx = Math.abs(endX - startX)
	const dy = Math.abs(endY - startY)
	const sx = startX < endX ? 1 : -1
	const sy = startY < endY ? 1 : -1
	let err = dx - dy

	let tracing = true
	while (tracing) {
		points.push({ x, y })
		if (x === endX && y === endY) {
			tracing = false
			continue
		}
		const err2 = err * 2
		if (err2 > -dy) {
			err -= dy
			x += sx
		}
		if (err2 < dx) {
			err += dx
			y += sy
		}
	}

	return points
}

export const buildSimulationPath = (
	path: Position[],
	tileWidth: number,
	tileHeight: number
): SimulationPathData => {
	if (!path || path.length === 0) {
		return { path: [], renderTargetStepIndices: [] }
	}

	const densePath: Position[] = []
	const renderTargetStepIndices: number[] = []

	for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
		const start = path[segmentIndex]
		const end = path[segmentIndex + 1]
		const startTileX = Math.floor(start.x / tileWidth)
		const startTileY = Math.floor(start.y / tileHeight)
		const endTileX = Math.floor(end.x / tileWidth)
		const endTileY = Math.floor(end.y / tileHeight)
		const tileLine = rasterizeTileLine(startTileX, startTileY, endTileX, endTileY)
		const lineStart = segmentIndex === 0 ? 0 : 1
		for (let tileIndex = lineStart; tileIndex < tileLine.length; tileIndex += 1) {
			const tile = tileLine[tileIndex]
			const position = {
				x: tile.x * tileWidth + tileWidth / 2,
				y: tile.y * tileHeight + tileHeight / 2
			}
			const last = densePath[densePath.length - 1]
			if (last && last.x === position.x && last.y === position.y) {
				continue
			}
			densePath.push(position)
		}
		if (densePath.length > 0) {
			const renderTarget = densePath.length - 1
			if (renderTargetStepIndices[renderTargetStepIndices.length - 1] !== renderTarget) {
				renderTargetStepIndices.push(renderTarget)
			}
		}
	}

	if (densePath.length === 0) {
		densePath.push({ ...path[0] })
	}

	return {
		path: densePath,
		renderTargetStepIndices
	}
}
