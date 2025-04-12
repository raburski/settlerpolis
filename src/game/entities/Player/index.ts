import { PlayerView } from './View'
import { PlayerController } from './Controller'

export const createPlayer = (scene: Phaser.Scene, playerId: string) => {
  const view = new PlayerView(scene)
  const controller = new PlayerController(view, scene, playerId)
  return { view, controller }
}