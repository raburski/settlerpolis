import { PlayerView2 } from './View2'
import { PlayerController } from './Controller'
import { PlayerView3 } from "./View3"

export const createPlayer = (scene: Phaser.Scene, playerId: string) => {
  const view = new PlayerView2(scene)
  const controller = new PlayerController(view, scene, playerId)
  return { view, controller }
}