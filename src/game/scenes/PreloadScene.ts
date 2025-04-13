import { Scene } from 'phaser'
import WebFont from 'webfontloader'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { PlayerView } from '../entities/Player/View'
import { PlayerView2 } from '../entities/Player/View2'
import networkManager from "../network"
import { playerService } from "../services/PlayerService"
import { NPCView } from "../entities/NPC/View"
import { PlayerView3 } from "../entities/Player/View3"
import { itemTextureService } from '../services/ItemTextureService'

export class PreloadScene extends Scene {
	private fontsLoaded: boolean = false
	private isConnected: boolean = false

	constructor() {
		super({ key: 'PreloadScene' })
	}

	preload() {
		// Show loading text while fonts are loading
		const loadingText = this.add.text(
			this.cameras.main.centerX,
			this.cameras.main.centerY,
			'Loading...',
			{
				// fontFamily: 'Arial',
				fontSize: '16px',
				color: '#ffffff'
			}
		)
		loadingText.setOrigin(0.5)
		
		// Preload player assets
		PlayerView2.preload(this)
		PlayerView3.preload(this)
		NPCView.preload(this)
		
		// Preload item assets
		itemTextureService.preload(this)
	}

	create() {
		// Wait for scene to be fully ready
		this.events.once('preupdate', function() {
			networkManager.connect(() => {
				EventBus.emit(Event.Players.CS.Connect)
			})
			
			// Set up connection response handler
			EventBus.once(Event.Players.SC.Connected, (data: { playerId: string, scene: string, position: { x: number, y: number }}) => {
				this.isConnected = true
				playerService.playerId = data.playerId
				this.scene.start(data.scene, {
					x: data.position.x,
					y: data.position.y,
					isTransition: false
				})
			})
		}, this)
	}
} 