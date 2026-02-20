import { BaseMovementView } from '../Movement/BaseMovementView'
import type { GameScene } from '../../scenes/base/GameScene'
import {
	AnimationGroup,
	AbstractMesh,
	AssetContainer,
	Color3,
	MeshBuilder,
	PBRMaterial,
	SceneLoader,
	Skeleton,
	StandardMaterial,
	TransformNode,
	Vector3
} from '@babylonjs/core'
import '@babylonjs/loaders'
import { ProfessionType, SettlerAnimationKey, SettlerRenderDefinition, SettlerState, SettlerStateContext, Direction, WorkStepType } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { itemService } from '../../services/ItemService'
import { settlerRenderService } from '../../services/SettlerRenderService'
import { NEED_URGENT_THRESHOLD } from '@rugged/game'
import { rotateVec3 } from '../../../shared/transform'

const SETTLER_HEIGHT = 40
const SETTLER_WIDTH = 20
const SETTLER_LENGTH = 20
const WALK_ANIMATION_REFERENCE_SPEED = 80
const WALK_ANIMATION_SPEED_BOOST = 1.15
const MIN_WALK_ANIMATION_SPEED_RATIO = 0.35
const MAX_WALK_ANIMATION_SPEED_RATIO = 2.5

export class SettlerView extends BaseMovementView {
	protected profession: ProfessionType
	protected state: SettlerState
	protected settlerId: string
	private stateContext: SettlerStateContext = {}
	private isHighlighted: boolean = false
	private highlightMesh: AbstractMesh | null = null
	private carryingItemType: string | null = null
	private carryingMesh: AbstractMesh | null = null
	private activeNeedKind: 'hunger' | 'fatigue' | null = null
	private needsMesh: AbstractMesh | null = null
	private needsValues: { hunger: number; fatigue: number } | null = null
	private renderUnsubscribe: (() => void) | null = null
	private invisibleMaterial: StandardMaterial | null = null
	private modelRoot: TransformNode | null = null
	private modelPivot: TransformNode | null = null
	private modelMeshes: AbstractMesh[] = []
	private modelInstanceRoots: TransformNode[] = []
	private modelInstanceSkeletons: Skeleton[] = []
	private modelInstanceAnimationGroups: AnimationGroup[] = []
	private modelSrc: string | null = null
	private animationSrc: string | null = null
	private modelFailedSrc: string | null = null
	private modelLoading: Promise<void> | null = null
	private modelNamePrefix: string | null = null
	private activeRender: SettlerRenderDefinition | null = null
	private currentDirection: Direction = Direction.Down
	private movementState: 'idle' | 'moving' = 'idle'
	private movementYaw: number | null = null
	private lastFacingYaw: number | null = null
	private externalMoveUntil = 0
	private currentAnimationName: string | null = null
	private carrySocketName: string | null = null
	private toolSocketName: string | null = null
	private carrySocketNode: TransformNode | AbstractMesh | null = null
	private toolSocketNode: TransformNode | AbstractMesh | null = null
	private currentMoveSpeed: number
	private readonly walkAnimationReferenceSpeed: number

	private professionEmojis: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Prospector]: '🧭',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️',
		[ProfessionType.Metallurgist]: '⚒️',
		[ProfessionType.Farmer]: '🌾',
		[ProfessionType.Fisher]: '🎣',
		[ProfessionType.Miller]: '🌬️',
		[ProfessionType.Baker]: '🥖',
		[ProfessionType.Vendor]: '🛍️',
		[ProfessionType.Hunter]: '🏹'
	}

	private static modelContainerCache = new Map<string, Promise<AssetContainer>>()
	private static animationContainerCache = new Map<string, Promise<AssetContainer>>()
	private static failedModelSrcs = new Set<string>()
	private static failedAnimationSrcs = new Set<string>()

	constructor(scene: GameScene, x: number, y: number, settlerId: string, profession: ProfessionType, speed: number = 64) {
		const size = { width: SETTLER_WIDTH, length: SETTLER_LENGTH, height: SETTLER_HEIGHT }
		const mesh = scene.runtime.renderer.createBox(`settler-${settlerId}`, size) as AbstractMesh
		super(scene, mesh, size, x, y, speed)
		this.settlerId = settlerId
		this.profession = profession
		this.state = SettlerState.Idle
		this.currentMoveSpeed = speed
		this.walkAnimationReferenceSpeed = speed > 0 ? speed : WALK_ANIMATION_REFERENCE_SPEED
		this.applyProfessionEmoji()
		void settlerRenderService.load()
		this.createHighlightMesh()
		this.setPickable(() => {
			EventBus.emit(UiEvents.Settler.Click, { settlerId: this.settlerId })
		})
		this.renderUnsubscribe = settlerRenderService.subscribe(() => {
			this.applyRender()
		})
		this.applyRender()
	}

	public override setSpeed(speed: number): void {
		if (!(speed > 0)) return
		this.currentMoveSpeed = speed
		super.setSpeed(speed)
		this.syncAnimation()
	}

	protected updateVisuals(direction: Direction, state: 'idle' | 'moving'): void {
		this.currentDirection = direction
		this.movementState = state
		if (state === 'moving') {
			const vector = this.movementController.getMovementVector()
			if (vector && (Math.abs(vector.x) + Math.abs(vector.y) > 1e-4)) {
				this.movementYaw = Math.atan2(vector.x, vector.y)
				this.lastFacingYaw = this.movementYaw
			}
			this.externalMoveUntil = 0
		} else if (this.externalMoveUntil === 0) {
			this.movementYaw = null
		}
		this.applyFacing()
		this.syncAnimation()
	}

	private applyProfessionEmoji(): void {
		const emoji = this.professionEmojis[this.profession]
		if (emoji) {
			this.scene.runtime.renderer.applyEmoji(this.getMesh(), emoji)
		} else {
			this.scene.runtime.renderer.applyTint(this.getMesh(), '#cccccc')
		}
	}

	public updateProfession(profession: ProfessionType): void {
		this.profession = profession
		this.applyRender()
	}

	public updateState(state: SettlerState, context?: SettlerStateContext): void {
		this.state = state
		if (context) {
			this.stateContext = context
		}
		this.syncAnimation()
	}

	public isInterpolating(): boolean {
		return this.movementController.isMoving()
	}

	public updateStateContext(context: SettlerStateContext): void {
		this.stateContext = context
		this.syncAnimation()
	}

	public preUpdate(): void {
		super.preUpdate()
		if (this.externalMoveUntil && Date.now() > this.externalMoveUntil && !this.movementController.isMoving()) {
			this.externalMoveUntil = 0
			this.movementYaw = null
			if (this.movementState !== 'idle') {
				this.movementState = 'idle'
				this.applyFacing()
				this.syncAnimation()
			}
		}
	}

	public updatePosition(x: number, y: number): void {
		const prevX = this.x
		const prevY = this.y
		super.updatePosition(x, y)
		const dx = x - prevX
		const dy = y - prevY
		const moved = Math.abs(dx) + Math.abs(dy) > 1e-3
		if (moved) {
			this.movementYaw = Math.atan2(dx, dy)
			this.lastFacingYaw = this.movementYaw
			this.movementState = 'moving'
			this.externalMoveUntil = Date.now() + 220
		} else if (Date.now() > this.externalMoveUntil) {
			this.movementYaw = null
			this.movementState = 'idle'
			this.externalMoveUntil = 0
		}
		this.applyFacing()
		this.syncAnimation()
	}

	public updateCarriedItem(_itemType?: string): void {
		const itemType = _itemType || null
		if (this.carryingItemType === itemType) return
		this.carryingItemType = itemType

		if (!itemType) {
			if (this.carryingMesh) {
				this.carryingMesh.dispose()
				this.carryingMesh = null
			}
			return
		}

		if (!this.carryingMesh) {
			const size = 10
			const mesh = MeshBuilder.CreateBox(
				`settler-carry-${this.settlerId}`,
				{ width: size, height: size, depth: size },
				this.scene.runtime.renderer.scene
			)
			mesh.isPickable = false
			mesh.parent = this.getMesh()
			mesh.position.y = this.height / 2 + 20
			this.carryingMesh = mesh
		}

		const metadata = itemService.getItemType(itemType)
		if (metadata?.emoji) {
			this.scene.runtime.renderer.applyEmoji(this.carryingMesh, metadata.emoji)
		} else {
			this.scene.runtime.renderer.applyTint(this.carryingMesh, '#ffffff')
		}

		this.attachCarryMesh()
	}

	public updateNeeds(_needs: any): void {
		if (_needs && typeof _needs.hunger === 'number' && typeof _needs.fatigue === 'number') {
			this.needsValues = { hunger: _needs.hunger, fatigue: _needs.fatigue }
		} else {
			this.needsValues = null
		}
		this.updateNeedsIndicator()
	}

	public updateHealth(_health: any): void {
		// no-op
	}

	public updateNeedActivity(_kind: 'hunger' | 'fatigue' | null): void {
		this.activeNeedKind = _kind
		this.updateNeedsIndicator()
	}

	public setHighlighted(highlighted: boolean): void {
		if (this.isHighlighted === highlighted) return
		this.isHighlighted = highlighted
		if (this.highlightMesh) {
			this.highlightMesh.setEnabled(highlighted)
		}
	}

	private createHighlightMesh(): void {
		if (this.highlightMesh) return
		const radius = 6
		const sphere = MeshBuilder.CreateSphere(
			`settler-highlight-${this.settlerId}`,
			{ diameter: radius * 2 },
			this.scene.runtime.renderer.scene
		)
		const material = new StandardMaterial(
			`settler-highlight-mat-${this.settlerId}`,
			this.scene.runtime.renderer.scene
		)
		material.diffuseColor = Color3.FromHexString('#ffeb3b')
		material.emissiveColor = Color3.FromHexString('#ffeb3b')
		material.specularColor = Color3.Black()
		sphere.material = material
		sphere.isPickable = false
		sphere.setEnabled(false)
		sphere.parent = this.getMesh()
		sphere.position.y = this.height / 2 + radius + 4
		this.highlightMesh = sphere
	}

	private updateNeedsIndicator(): void {
		let kind: 'hunger' | 'fatigue' | null = this.activeNeedKind
		if (!kind && this.needsValues) {
			const hunger = this.needsValues.hunger
			const fatigue = this.needsValues.fatigue
			const isHungerUrgent = hunger <= NEED_URGENT_THRESHOLD
			const isFatigueUrgent = fatigue <= NEED_URGENT_THRESHOLD
			if (isHungerUrgent || isFatigueUrgent) {
				kind = hunger <= fatigue ? 'hunger' : 'fatigue'
			}
		}

		if (!kind) {
			if (this.needsMesh) {
				this.needsMesh.dispose()
				this.needsMesh = null
			}
			return
		}

		if (!this.needsMesh) {
			const size = 9
			const mesh = MeshBuilder.CreateBox(
				`settler-need-${this.settlerId}`,
				{ width: size, height: size, depth: size },
				this.scene.runtime.renderer.scene
			)
			mesh.isPickable = false
			mesh.parent = this.getMesh()
			mesh.position.y = this.height / 2 + 34
			this.needsMesh = mesh
		}

		const emoji = kind === 'hunger' ? '🍗' : '😴'
		this.scene.runtime.renderer.applyEmoji(this.needsMesh, emoji)
	}

	private async applyRender(): Promise<void> {
		const render = settlerRenderService.getRender(this.profession)
		this.activeRender = render
		this.carrySocketName = render?.attachments?.carrySocket ?? null
		this.toolSocketName = render?.attachments?.toolSocket ?? null
		this.carrySocketNode = null
		this.toolSocketNode = null
		if (!render?.modelSrc) {
			this.disposeModel()
			this.applyProfessionEmoji()
			return
		}

		if (this.modelSrc === render.modelSrc && this.modelRoot) {
			this.applyModelTransform(render)
			this.applyInvisibleBase()
			if (render.animationSrc && this.animationSrc !== render.animationSrc) {
				await this.loadAnimationClips(render.animationSrc)
			}
			this.syncAnimation()
			this.resolveAttachmentNodes()
			return
		}

		if (SettlerView.failedModelSrcs.has(render.modelSrc)) {
			this.applyProfessionEmoji()
			return
		}

		this.applyInvisibleBase()
		await this.loadRenderModel(render)
	}

	private async loadRenderModel(render: SettlerRenderDefinition): Promise<void> {
		if (!render.modelSrc) return
		if (this.modelFailedSrc && this.modelFailedSrc !== render.modelSrc) {
			this.modelFailedSrc = null
		}
		if (this.modelSrc === render.modelSrc && this.modelRoot) {
			this.applyModelTransform(render)
			this.applyInvisibleBase()
			return
		}
		if (SettlerView.failedModelSrcs.has(render.modelSrc)) {
			return
		}
		if (this.modelLoading) {
			return
		}

		this.disposeModel()
		this.modelSrc = render.modelSrc
		try {
			this.modelLoading = (async () => {
				const scene = this.scene.runtime.renderer.scene
				const container = await SettlerView.getModelContainer(scene, render.modelSrc)
				const namePrefix = `settler-model-${this.settlerId}`
				this.modelNamePrefix = namePrefix
				const instance = container.instantiateModelsToScene(
					(name) => (name ? `${namePrefix}-${name}` : namePrefix),
					false
				)
				this.modelRoot = new TransformNode(`settler-model-${this.settlerId}`, scene)
				this.modelPivot = new TransformNode(`settler-model-pivot-${this.settlerId}`, scene)
				this.modelPivot.parent = this.modelRoot
				this.modelInstanceRoots = (instance.rootNodes || []) as TransformNode[]
				this.modelInstanceSkeletons = instance.skeletons || []
				this.modelInstanceAnimationGroups = instance.animationGroups || []
				const meshSet = new Set<AbstractMesh>()
				this.modelInstanceRoots.forEach((node) => {
					if (node.parent === null) {
						node.parent = this.modelPivot
					}
					node.setEnabled(true)
					if (node instanceof AbstractMesh) {
						meshSet.add(node)
					}
					if ('getChildMeshes' in node && typeof node.getChildMeshes === 'function') {
						node.getChildMeshes(false).forEach((mesh) => meshSet.add(mesh))
					}
				})
				this.modelMeshes = Array.from(meshSet)
				this.modelMeshes.forEach((mesh) => {
					mesh.isPickable = false
					mesh.isVisible = true
					mesh.visibility = 1
					mesh.setEnabled(true)
					mesh.refreshBoundingInfo()
					mesh.computeWorldMatrix(true)
				})
				this.applyModelLighting(render)
				if (this.modelInstanceSkeletons.length === 1) {
					const skeleton = this.modelInstanceSkeletons[0]
					this.modelMeshes.forEach((mesh) => {
						if (!mesh.skeleton) {
							mesh.skeleton = skeleton
						}
					})
				}
				this.centerModel()
				this.modelRoot.parent = this.getMesh()
				this.applyModelTransform(render)
				this.applyInvisibleBase()

				if (render.animationSrc) {
					await this.loadAnimationClips(render.animationSrc)
				}

				this.resolveAttachmentNodes()
				this.syncAnimation()
				this.modelFailedSrc = null
			})()
			await this.modelLoading
		} catch (error) {
			SettlerView.failedModelSrcs.add(render.modelSrc)
			console.warn('[SettlerView] Failed to load model', render.modelSrc, error)
			this.disposeModel()
			this.modelSrc = null
			this.modelFailedSrc = render.modelSrc
			this.applyProfessionEmoji()
		} finally {
			this.modelLoading = null
		}
	}

	private async loadAnimationClips(animationSrc: string): Promise<void> {
		if (!this.modelRoot) return
		if (SettlerView.failedAnimationSrcs.has(animationSrc)) {
			return
		}
		const previousGroups = this.modelInstanceAnimationGroups
		try {
			const scene = this.scene.runtime.renderer.scene
			const container = await SettlerView.getAnimationContainer(scene, animationSrc)
			const nodeMap = this.buildAnimationTargetMap()
			const clones: AnimationGroup[] = []
			const resolveTargetByName = (name: string): TransformNode | AbstractMesh | import('@babylonjs/core').Bone | null => {
				const normalized = normalizeAnimationTargetName(name)
				const direct = nodeMap.get(name) ?? nodeMap.get(normalized)
				if (direct) return direct
				if (this.modelNamePrefix && name.startsWith(`${this.modelNamePrefix}-`)) {
					const stripped = name.slice(this.modelNamePrefix.length + 1)
					return nodeMap.get(stripped) ?? nodeMap.get(normalizeAnimationTargetName(stripped)) ?? null
				}
				return null
			}
			container.animationGroups?.forEach((group) => {
				const clone = group.clone(group.name, (target) => {
					if (!target || typeof (target as { name?: string }).name !== 'string') {
						return target
					}
					const name = (target as { name?: string }).name
					if (!name) return target
					return resolveTargetByName(name) ?? target
				}, true)
				clones.push(clone)
			})
			if (clones.length > 0) {
				previousGroups.forEach((group) => group.dispose())
				this.modelInstanceAnimationGroups = clones
				this.animationSrc = animationSrc
				this.currentAnimationName = null
			}
		} catch (error) {
			SettlerView.failedAnimationSrcs.add(animationSrc)
			console.warn('[SettlerView] Failed to load animation clips', animationSrc, error)
		}
	}

	private buildAnimationTargetMap(): Map<string, TransformNode | AbstractMesh | import('@babylonjs/core').Bone> {
		const map = new Map<string, TransformNode | AbstractMesh | import('@babylonjs/core').Bone>()
		if (!this.modelRoot) return map
		const root = this.modelRoot
		const setIfMissing = (key: string, target: TransformNode | AbstractMesh | import('@babylonjs/core').Bone) => {
			if (!key) return
			if (!map.has(key)) {
				map.set(key, target)
			}
		}
		const addEntry = (name: string, target: TransformNode | AbstractMesh | import('@babylonjs/core').Bone) => {
			if (!name) return
			const normalized = normalizeAnimationTargetName(name)
			setIfMissing(name, target)
			setIfMissing(normalized, target)
			if (this.modelNamePrefix && name.startsWith(`${this.modelNamePrefix}-`)) {
				const stripped = name.slice(this.modelNamePrefix.length + 1)
				setIfMissing(stripped, target)
				setIfMissing(normalizeAnimationTargetName(stripped), target)
			}
		}
		if ('getChildTransformNodes' in root && typeof root.getChildTransformNodes === 'function') {
			root.getChildTransformNodes(false).forEach((node: TransformNode) => {
				if (node.name) {
					addEntry(node.name, node)
				}
			})
		}
		if ('getChildMeshes' in root && typeof root.getChildMeshes === 'function') {
			root.getChildMeshes(false).forEach((mesh: AbstractMesh) => {
				if (mesh.name) {
					addEntry(mesh.name, mesh)
				}
			})
		}
		this.modelInstanceRoots.forEach((node) => {
			if (node.name) {
				addEntry(node.name, node)
			}
		})
		this.modelInstanceSkeletons.forEach((skeleton) => {
			skeleton.bones.forEach((bone) => {
				if (bone.name) {
					addEntry(bone.name, bone)
				}
			})
		})
		return map
	}

	private buildNodeMap(): Map<string, TransformNode | AbstractMesh> {
		const map = new Map<string, TransformNode | AbstractMesh>()
		if (!this.modelRoot) return map
		const root = this.modelRoot
		const addEntry = (name: string, target: TransformNode | AbstractMesh) => {
			if (!name) return
			const normalized = normalizeAnimationTargetName(name)
			map.set(name, target)
			map.set(normalized, target)
			if (this.modelNamePrefix && name.startsWith(`${this.modelNamePrefix}-`)) {
				const stripped = name.slice(this.modelNamePrefix.length + 1)
				map.set(stripped, target)
				map.set(normalizeAnimationTargetName(stripped), target)
			}
		}
		if ('getChildTransformNodes' in root && typeof root.getChildTransformNodes === 'function') {
			root.getChildTransformNodes(false).forEach((node: TransformNode) => {
				if (node.name) {
					addEntry(node.name, node)
				}
			})
		}
		if ('getChildMeshes' in root && typeof root.getChildMeshes === 'function') {
			root.getChildMeshes(false).forEach((mesh: AbstractMesh) => {
				if (mesh.name) {
					addEntry(mesh.name, mesh)
				}
			})
		}
		this.modelInstanceRoots.forEach((node) => {
			if (node.name) {
				addEntry(node.name, node)
			}
		})
		return map
	}

	private resolveAttachmentNodes(): void {
		if (!this.modelRoot) return
		const nodeMap = this.buildNodeMap()
		this.carrySocketNode = this.carrySocketName ? nodeMap.get(this.carrySocketName) ?? null : null
		this.toolSocketNode = this.toolSocketName ? nodeMap.get(this.toolSocketName) ?? null : null
		this.attachCarryMesh()
	}

	private attachCarryMesh(): void {
		if (!this.carryingMesh) return
		if (this.carrySocketNode) {
			this.carryingMesh.parent = this.carrySocketNode
			this.carryingMesh.position.set(0, 0, 0)
			return
		}
		this.carryingMesh.parent = this.getMesh()
		this.carryingMesh.position.y = this.height / 2 + 20
	}

	private applyModelTransform(render: SettlerRenderDefinition): void {
		if (!this.modelRoot) return
		const transform = render.transform || {}
		const rotation = transform.rotation ?? { x: 0, y: 0, z: 0 }
		const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
		const elevation = transform.elevation ?? 0
		const offset = transform.offset ?? { x: 0, y: 0, z: 0 }
		const tileSize = this.scene.map?.tileWidth || 32
		const directionYaw =
			this.movementYaw ??
			this.lastFacingYaw ??
			getDirectionYaw(this.currentDirection)
		const finalRotation = {
			x: rotation.x ?? 0,
			y: (rotation.y ?? 0) + directionYaw,
			z: rotation.z ?? 0
		}
		const rotatedOffset = rotateVec3(offset, finalRotation)
		this.modelRoot.position = new Vector3(
			rotatedOffset.x * tileSize,
			-this.height / 2 + (elevation + rotatedOffset.y) * tileSize,
			rotatedOffset.z * tileSize
		)
		this.modelRoot.rotation = new Vector3(finalRotation.x, finalRotation.y, finalRotation.z)
		this.modelRoot.scaling = new Vector3(
			(scale.x ?? 1) * tileSize,
			(scale.y ?? 1) * tileSize,
			(scale.z ?? 1) * tileSize
		)
	}

	private applyFacing(): void {
		if (!this.activeRender) return
		this.applyModelTransform(this.activeRender)
	}

	private applyInvisibleBase(): void {
		const baseMesh = this.getMesh()
		if (!this.invisibleMaterial) {
			this.invisibleMaterial = new StandardMaterial(`settler-invisible-${this.settlerId}`, baseMesh.getScene())
			this.invisibleMaterial.diffuseColor = Color3.Black()
			this.invisibleMaterial.emissiveColor = Color3.Black()
			this.invisibleMaterial.specularColor = Color3.Black()
			this.invisibleMaterial.alpha = 0
			this.invisibleMaterial.disableDepthWrite = true
		}
		baseMesh.material = this.invisibleMaterial
		baseMesh.visibility = 1
	}

	private applyModelLighting(render: SettlerRenderDefinition): void {
		const configured = render.lighting || {}
		const uniqueMaterials = new Set<object>()
		this.modelMeshes.forEach((mesh) => {
			const material = mesh.material
			if (!material || uniqueMaterials.has(material)) return
			uniqueMaterials.add(material)
			if (!(material instanceof PBRMaterial)) return

			const hasSharedEmissiveTexture =
				Boolean(material.emissiveTexture) &&
				Boolean(material.albedoTexture) &&
				material.emissiveTexture === material.albedoTexture
			const shouldApplyDefaultTweaks = hasSharedEmissiveTexture && !material.metallicTexture

			const defaultEmissiveStrength = shouldApplyDefaultTweaks ? 0.72 : 1
			const emissiveStrength = clamp(
				Number.isFinite(configured.emissiveStrength)
					? (configured.emissiveStrength as number)
					: defaultEmissiveStrength,
				0,
				2
			)
			const defaultMetallic = shouldApplyDefaultTweaks ? 0.08 : material.metallic
			const defaultRoughness = shouldApplyDefaultTweaks ? 0.9 : material.roughness

			material.metallic = clamp(
				Number.isFinite(configured.metallic)
					? (configured.metallic as number)
					: defaultMetallic,
				0,
				1
			)
			material.roughness = clamp(
				Number.isFinite(configured.roughness)
					? (configured.roughness as number)
					: defaultRoughness,
				0,
				1
			)
			if (material.emissiveTexture) {
				material.emissiveColor = new Color3(emissiveStrength, emissiveStrength, emissiveStrength)
			}
		})
	}

	private syncAnimation(): void {
		if (!this.modelRoot || this.modelInstanceAnimationGroups.length === 0) return
		const key = this.resolveAnimationKey()
		const { name, sourceKey } = this.resolveAnimationName(key)
		this.playAnimationByName(name, this.resolveAnimationSpeedRatio(sourceKey))
	}

	private resolveAnimationKey(): SettlerAnimationKey {
		if (isMovingState(this.state)) {
			return this.state === SettlerState.CarryingItem ? 'carry' : 'walk'
		}
		if (this.movementState === 'moving') {
			return this.state === SettlerState.CarryingItem ? 'carry' : 'walk'
		}
		switch (this.state) {
			case SettlerState.CarryingItem:
				return 'carry'
			case SettlerState.Working:
				return resolveWorkAnimationKey(this.stateContext)
			case SettlerState.WaitingForWork:
				return 'wait'
			case SettlerState.Packing:
			case SettlerState.Unpacking:
			case SettlerState.Assigned:
			case SettlerState.Spawned:
			case SettlerState.AssignmentFailed:
			case SettlerState.Idle:
			default:
				return 'idle'
		}
	}

	private resolveAnimationName(key: SettlerAnimationKey): { name: string | null; sourceKey: SettlerAnimationKey | null } {
		const animations = this.activeRender?.animations
		if (animations && animations[key]) {
			return { name: animations[key] || null, sourceKey: key }
		}
		const fallbackKeys = getAnimationFallbacks(key)
		if (animations && fallbackKeys.length) {
			for (const fallback of fallbackKeys) {
				if (animations[fallback]) {
					return { name: animations[fallback] || null, sourceKey: fallback }
				}
			}
		}
		const firstGroup = this.modelInstanceAnimationGroups[0]
		return { name: firstGroup ? firstGroup.name : null, sourceKey: null }
	}

	private resolveAnimationSpeedRatio(key: SettlerAnimationKey | null): number {
		if (key !== 'walk' && key !== 'run' && key !== 'carry') {
			return 1
		}
		const referenceSpeed = this.walkAnimationReferenceSpeed > 0
			? this.walkAnimationReferenceSpeed
			: WALK_ANIMATION_REFERENCE_SPEED
		const rawRatio = (this.currentMoveSpeed / referenceSpeed) * WALK_ANIMATION_SPEED_BOOST
		return clamp(rawRatio, MIN_WALK_ANIMATION_SPEED_RATIO, MAX_WALK_ANIMATION_SPEED_RATIO)
	}

	private playAnimationByName(name: string | null, speedRatio: number = 1): void {
		if (!name) {
			this.stopAnimations()
			return
		}
		const appliedSpeedRatio = Number.isFinite(speedRatio) && speedRatio > 0 ? speedRatio : 1
		let group = this.modelInstanceAnimationGroups.find((entry) => entry.name === name)
		if (!group && this.modelInstanceAnimationGroups.length > 0) {
			group = this.modelInstanceAnimationGroups[0]
		}
		if (!group) return
		if (this.currentAnimationName === name) {
			group.speedRatio = appliedSpeedRatio
			return
		}
		this.stopAnimations()
		group.reset()
		group.speedRatio = appliedSpeedRatio
		group.start(true)
		this.currentAnimationName = name
	}

	private stopAnimations(): void {
		this.modelInstanceAnimationGroups.forEach((group) => {
			group.stop()
		})
		this.currentAnimationName = null
	}

	private centerModel(): void {
		if (!this.modelPivot || this.modelMeshes.length === 0) return
		const bounds = getBounds(this.modelMeshes)
		if (!bounds) return
		const center = bounds.min.add(bounds.max).scale(0.5)
		this.modelPivot.position = new Vector3(-center.x, -bounds.min.y, -center.z)
	}

	private disposeAnimations(): void {
		this.modelInstanceAnimationGroups.forEach((group) => group.dispose())
		this.modelInstanceAnimationGroups = []
		this.currentAnimationName = null
	}

	private disposeModel(): void {
		this.disposeAnimations()
		this.modelInstanceSkeletons.forEach((skeleton) => skeleton.dispose())
		this.modelInstanceSkeletons = []
		this.modelInstanceRoots.forEach((node) => node.dispose())
		this.modelInstanceRoots = []
		this.modelMeshes.forEach((mesh) => mesh.dispose(false, true))
		this.modelMeshes = []
		this.modelRoot?.dispose()
		this.modelPivot?.dispose()
		this.modelRoot = null
		this.modelPivot = null
		this.modelSrc = null
		this.animationSrc = null
		this.modelNamePrefix = null
		this.carrySocketNode = null
		this.toolSocketNode = null
	}

	private static async getModelContainer(
		scene: import('@babylonjs/core').Scene,
		modelSrc: string
	): Promise<AssetContainer> {
		const cached = SettlerView.modelContainerCache.get(modelSrc)
		if (cached) return cached
		const { rootUrl, fileName } = splitAssetUrl(modelSrc)
		const promise = SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene)
			.then((container) => {
				container.removeAllFromScene()
				return container
			})
			.catch((error) => {
				SettlerView.modelContainerCache.delete(modelSrc)
				throw error
			})
		SettlerView.modelContainerCache.set(modelSrc, promise)
		return promise
	}

	private static async getAnimationContainer(
		scene: import('@babylonjs/core').Scene,
		animationSrc: string
	): Promise<AssetContainer> {
		const cached = SettlerView.animationContainerCache.get(animationSrc)
		if (cached) return cached
		const { rootUrl, fileName } = splitAssetUrl(animationSrc)
		const promise = SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene)
			.then((container) => {
				container.removeAllFromScene()
				return container
			})
			.catch((error) => {
				SettlerView.animationContainerCache.delete(animationSrc)
				throw error
			})
		SettlerView.animationContainerCache.set(animationSrc, promise)
		return promise
	}

	public destroy(): void {
		this.renderUnsubscribe?.()
		this.renderUnsubscribe = null
		this.disposeModel()
		if (this.highlightMesh) {
			this.highlightMesh.dispose()
			this.highlightMesh = null
		}
		if (this.carryingMesh) {
			this.carryingMesh.dispose()
			this.carryingMesh = null
		}
		if (this.needsMesh) {
			this.needsMesh.dispose()
			this.needsMesh = null
		}
		super.destroy()
	}
}

function getDirectionYaw(direction: Direction): number {
	switch (direction) {
		case Direction.Left:
			return -Math.PI / 2
		case Direction.Right:
			return Math.PI / 2
		case Direction.Up:
			return Math.PI
		case Direction.Down:
		default:
			return 0
	}
}

function normalizeAnimationTargetName(name: string): string {
	if (!name) return name
	const withoutPipes = name.includes('|') ? name.split('|').pop() || name : name
	const withoutDots = withoutPipes.split('.').join('')
	const primitiveIndex = withoutDots.indexOf('_primitive')
	return primitiveIndex >= 0 ? withoutDots.slice(0, primitiveIndex) : withoutDots
}

function resolveWorkAnimationKey(context: SettlerStateContext): SettlerAnimationKey {
	switch (context.lastStepType) {
		case WorkStepType.Construct:
			return 'construct'
		case WorkStepType.Harvest:
			return 'harvest'
		case WorkStepType.Fish:
			return 'fish'
		case WorkStepType.Hunt:
			return 'hunt'
		case WorkStepType.Plant:
			return 'plant'
		case WorkStepType.Produce:
			return 'produce'
		case WorkStepType.BuildRoad:
			return 'build_road'
		default:
			return 'work'
	}
}

function isMovingState(state: SettlerState): boolean {
	return (
		state === SettlerState.Moving ||
		state === SettlerState.MovingToItem ||
		state === SettlerState.CarryingItem ||
		state === SettlerState.MovingToBuilding ||
		state === SettlerState.MovingToTool ||
		state === SettlerState.MovingToResource ||
		state === SettlerState.MovingHome
	)
}

function getAnimationFallbacks(key: SettlerAnimationKey): SettlerAnimationKey[] {
	switch (key) {
		case 'carry':
			return ['walk', 'work', 'idle']
		case 'construct':
		case 'harvest':
		case 'fish':
		case 'hunt':
		case 'plant':
		case 'produce':
		case 'build_road':
		case 'work':
			return ['work', 'idle']
		case 'wait':
		case 'sleep':
		case 'consume':
			return ['idle']
		case 'run':
			return ['walk', 'idle']
		case 'walk':
			return ['run', 'idle']
		case 'idle':
		default:
			return []
	}
}

function splitAssetUrl(url: string): { rootUrl: string; fileName: string } {
	const trimmed = url.trim()
	if (!trimmed) return { rootUrl: '', fileName: '' }
	const lastSlash = trimmed.lastIndexOf('/')
	if (lastSlash === -1) {
		return { rootUrl: '/', fileName: trimmed }
	}
	return {
		rootUrl: trimmed.slice(0, lastSlash + 1),
		fileName: trimmed.slice(lastSlash + 1)
	}
}

function getBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
	let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
	let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
	let found = false
	meshes.forEach((mesh) => {
		if (mesh.getTotalVertices() === 0) return
		mesh.computeWorldMatrix(true)
		const bounds = mesh.getBoundingInfo().boundingBox
		min = Vector3.Minimize(min, bounds.minimumWorld)
		max = Vector3.Maximize(max, bounds.maximumWorld)
		found = true
	})
	return found ? { min, max } : null
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}
