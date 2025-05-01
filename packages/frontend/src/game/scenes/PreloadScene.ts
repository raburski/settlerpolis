import { Scene } from 'phaser'
import WebFont from 'webfontloader'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { PlayerView } from '../entities/Player/View'
import { PlayerView2 } from '../entities/Player/View2'
import networkManager from "../network"
import { playerService } from "../services/PlayerService"
import { NPCView } from "../entities/NPC/View"
import { PlayerView3 } from "../entities/Player/View3"
import { itemTextureService } from '../services/ItemTextureService'
import { sceneManager } from '../services/SceneManager'

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
		// Initialize the SceneManager with the game instance
		sceneManager.init(this.game)
		
		// Wait for scene to be fully ready
		this.events.once('preupdate', function() {
			// Connect to the game server
			networkManager.connect(() => {
				console.log('[PreloadScene] Connected to game server, sending connect event')
				EventBus.emit(Event.Players.CS.Connect)
			})
			
			// Set up connection response handler
			EventBus.once(Event.Players.SC.Connected, (data: { playerId: string }) => {
				this.isConnected = true
				playerService.playerId = data.playerId
				console.log('[PreloadScene] Player connected with ID:', data.playerId)
			})
		}, this)
	}
} 