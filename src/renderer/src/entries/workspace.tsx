import { createRoot } from 'react-dom/client'
import WorkspaceView from '@renderer/views/WorkspaceView'
import '@renderer/styles/tokens.css'
import '@renderer/styles/global.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<WorkspaceView />)
}
