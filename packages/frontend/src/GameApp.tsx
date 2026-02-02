import { useRef } from 'react'
import { BabylonGame, IRefBabylonGame } from './game/BabylonGame'
import { DisconnectModal } from './game/components/DisconnectModal'
import { FullscreenMessage } from './game/components/FullscreenMessage'
import { UIContainer } from './game/components/UIContainer'

export function GameApp() {
	const gameRef = useRef<IRefBabylonGame | null>(null)

	return (
		<div id="app">
			<BabylonGame ref={gameRef} />
			<UIContainer />
			<DisconnectModal />
			<FullscreenMessage />
		</div>
	)
}
