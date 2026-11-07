import { createRoot } from 'react-dom/client'
import StartView from '@renderer/views/StartView'
import '@renderer/styles/tokens.css'
import '@renderer/styles/global.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<StartView />)
}
