import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { CaptionOverlay } from './overlay/CaptionOverlay'
import './styles/app.css'

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('Root element was not found')

createRoot(rootElement).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has('overlay') ? <CaptionOverlay /> : <App />}
  </StrictMode>
)
