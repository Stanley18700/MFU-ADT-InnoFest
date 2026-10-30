import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Self-hosted, not Google Fonts: event Wi-Fi in a stadium is the network this has to survive.
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/600.css'
import '@fontsource/ibm-plex-sans-thai/700.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import { AuthProvider } from './lib/auth'
import { LocaleProvider } from './lib/locale'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'

/*
 * The boot splash in index.html goes once React has painted over it — two frames, not one:
 * `render()` returns before the first commit, so removing it immediately puts the white page back
 * for a frame. It fades rather than cutting, because the app's own loading screen behind it is the
 * same picture and a cut would read as a flicker.
 */
function dropBootSplash() {
  const boot = document.getElementById('boot')
  if (!boot) return
  requestAnimationFrame(() => requestAnimationFrame(() => {
    boot.classList.add('gone')
    boot.addEventListener('transitionend', () => boot.remove(), { once: true })
    setTimeout(() => boot.remove(), 600)
  }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)

dropBootSplash()
