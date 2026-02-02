import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react'
import StartGame from './main'

export interface IRefBabylonGame {
	game: ReturnType<typeof StartGame> | null
}

interface IProps {
	currentActiveScene?: () => void
}

export const BabylonGame = forwardRef<IRefBabylonGame, IProps>(function BabylonGame(_props, ref) {
	const gameRef = useRef<ReturnType<typeof StartGame> | null>(null)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)

	useLayoutEffect(() => {
		if (gameRef.current || !canvasRef.current) {
			return
		}

		gameRef.current = StartGame(canvasRef.current)

		if (typeof ref === 'function') {
			ref({ game: gameRef.current })
		} else if (ref) {
			ref.current = { game: gameRef.current }
		}

		return () => {
			if (gameRef.current) {
				gameRef.current.dispose()
				gameRef.current = null
			}
		}
	}, [ref])

	useEffect(() => {
		if (typeof ref === 'function') {
			ref({ game: gameRef.current })
		} else if (ref) {
			ref.current = { game: gameRef.current }
		}
	}, [ref])

	return (
		<div id="game-container">
			<canvas ref={canvasRef} id="game-canvas" />
		</div>
	)
})
