import { PlayerView } from './View'
import { PlayerView2 } from './View2'
import { PlayerController } from './Controller'

export const createPlayer = (scene: Phaser.Scene, playerId: string) => {
  const view = new PlayerView(scene)
  const controller = new PlayerController(view, scene, playerId)
  return { view, controller }
}

export const createPlayerWithNewSprite = (scene: Phaser.Scene, playerId: string) => {
  const view = new PlayerView2(scene)
  const controller = new PlayerController(view, scene, playerId)
  return { view, controller }
}