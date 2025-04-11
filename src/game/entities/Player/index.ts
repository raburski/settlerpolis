import { PlayerView } from './View'
import { PlayerController } from './Controller'

export const createPlayer = (scene: Phaser.Scene) => {
  const view = new PlayerView(scene)
  const controller = new PlayerController(view, scene)
  return { view, controller }
}