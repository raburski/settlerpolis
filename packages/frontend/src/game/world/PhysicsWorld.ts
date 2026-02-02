export interface CollisionGrid {
	width: number
	height: number
	tileSize: number
	cells: boolean[][]
}

export interface BodyBounds {
	x: number
	y: number
	width: number
	height: number
}

export class KinematicBody {
	public x: number
	public y: number
	public width: number = 16
	public height: number = 16
	public offsetX: number = 0
	public offsetY: number = 0
	public velocityX: number = 0
	public velocityY: number = 0
	public immovable: boolean = false
	public collideWorldBounds: boolean = true
	public blocked = { up: false, down: false, left: false, right: false }

	constructor(x: number, y: number) {
		this.x = x
		this.y = y
	}

	setSize(width: number, height: number): void {
		this.width = width
		this.height = height
	}

	setOffset(x: number, y: number): void {
		this.offsetX = x
		this.offsetY = y
	}

	setVelocity(x: number, y: number): void {
		this.velocityX = x
		this.velocityY = y
	}

	setVelocityX(x: number): void {
		this.velocityX = x
	}

	setVelocityY(y: number): void {
		this.velocityY = y
	}

	setImmovable(immovable: boolean): void {
		this.immovable = immovable
	}

	setCollideWorldBounds(enabled: boolean): void {
		this.collideWorldBounds = enabled
	}

	getBounds(): BodyBounds {
		return {
			x: this.x + this.offsetX,
			y: this.y + this.offsetY,
			width: this.width,
			height: this.height
		}
	}
}

export class PhysicsWorld {
	private bodies: Set<KinematicBody> = new Set()
	private collisionGrid: CollisionGrid | null = null
	private staticRects: BodyBounds[] = []
	private bounds: { width: number; height: number } = { width: 0, height: 0 }

	setCollisionGrid(grid: CollisionGrid | null): void {
		this.collisionGrid = grid
	}

	setWorldBounds(width: number, height: number): void {
		this.bounds = { width, height }
	}

	addStaticRect(rect: BodyBounds): BodyBounds {
		this.staticRects.push(rect)
		return rect
	}

	removeStaticRect(rect: BodyBounds): void {
		this.staticRects = this.staticRects.filter((entry) => entry !== rect)
	}

	clearStatics(): void {
		this.staticRects = []
	}

	addBody(body: KinematicBody): void {
		this.bodies.add(body)
	}

	removeBody(body: KinematicBody): void {
		this.bodies.delete(body)
	}

	update(deltaMs: number): void {
		const delta = deltaMs / 1000
		for (const body of this.bodies) {
			if (body.immovable) continue
			body.blocked = { up: false, down: false, left: false, right: false }
			this.integrateBody(body, delta)
		}
	}

	private integrateBody(body: KinematicBody, delta: number): void {
		const nextX = body.x + body.velocityX * delta
		const nextY = body.y + body.velocityY * delta

		let resolvedX = body.x
		let resolvedY = body.y

		if (body.velocityX !== 0) {
			const candidate = { ...body, x: nextX, y: resolvedY }
			if (this.isBlocked(candidate)) {
				body.blocked.left = body.velocityX < 0
				body.blocked.right = body.velocityX > 0
			} else {
				resolvedX = nextX
			}
		}

		if (body.velocityY !== 0) {
			const candidate = { ...body, x: resolvedX, y: nextY }
			if (this.isBlocked(candidate)) {
				body.blocked.up = body.velocityY < 0
				body.blocked.down = body.velocityY > 0
			} else {
				resolvedY = nextY
			}
		}

		body.x = this.clamp(resolvedX, 0, this.bounds.width)
		body.y = this.clamp(resolvedY, 0, this.bounds.height)
	}

	private isBlocked(body: Pick<KinematicBody, 'x' | 'y' | 'width' | 'height' | 'offsetX' | 'offsetY' | 'collideWorldBounds'>): boolean {
		const bounds = {
			x: body.x + body.offsetX,
			y: body.y + body.offsetY,
			width: body.width,
			height: body.height
		}

		if (body.collideWorldBounds) {
			if (bounds.x < 0 || bounds.y < 0) return true
			if (bounds.x + bounds.width > this.bounds.width) return true
			if (bounds.y + bounds.height > this.bounds.height) return true
		}

		if (this.collisionGrid && this.collidesWithGrid(bounds, this.collisionGrid)) {
			return true
		}

		for (const rect of this.staticRects) {
			if (this.rectsOverlap(bounds, rect)) return true
		}

		return false
	}

	private collidesWithGrid(bounds: BodyBounds, grid: CollisionGrid): boolean {
		const tileSize = grid.tileSize
		const left = Math.floor(bounds.x / tileSize)
		const right = Math.floor((bounds.x + bounds.width - 1) / tileSize)
		const top = Math.floor(bounds.y / tileSize)
		const bottom = Math.floor((bounds.y + bounds.height - 1) / tileSize)

		for (let row = top; row <= bottom; row += 1) {
			for (let col = left; col <= right; col += 1) {
				if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) {
					return true
				}
				if (grid.cells[row]?.[col]) {
					return true
				}
			}
		}
		return false
	}

	private rectsOverlap(a: BodyBounds, b: BodyBounds): boolean {
		return (
			a.x < b.x + b.width &&
			a.x + a.width > b.x &&
			a.y < b.y + b.height &&
			a.y + a.height > b.y
		)
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value))
	}
}
