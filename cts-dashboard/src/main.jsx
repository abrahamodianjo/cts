import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
)
