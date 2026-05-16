import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './ThemeContext'
import { AuthProvider } from './AuthContext'
import { AudioOrbProvider } from './contexts/AudioOrbContext'
import { AvatarThemeSync } from './components/AvatarThemeSync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AudioOrbProvider>
          <AvatarThemeSync />
          <App />
        </AudioOrbProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
