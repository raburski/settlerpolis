import { EditorApp } from './editor/EditorApp'
import { GameApp } from './GameApp'
import { MapGeneratorApp } from './map/MapGeneratorApp'

const isEditorRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/editor')
const isMapRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/map')

function App() {
	if (isMapRoute) {
		return <MapGeneratorApp />
	}
	if (isEditorRoute) {
		return <EditorApp />
	}
	return <GameApp />
}

export default App
