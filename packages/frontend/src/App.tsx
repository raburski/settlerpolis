import { EditorApp } from './editor/EditorApp'
import { GameApp } from './GameApp'

const isEditorRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/editor')

function App() {
	return isEditorRoute ? <EditorApp /> : <GameApp />
}

export default App
