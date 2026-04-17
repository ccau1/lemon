import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './i18n.ts'
import './index.css'
import App from './App.tsx'
import { WorkspaceProvider } from './WorkspaceContext.tsx'
import { ConnectedProvider } from './ConnectedContext.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConnectedProvider>
        <WorkspaceProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WorkspaceProvider>
      </ConnectedProvider>
    </QueryClientProvider>
  </StrictMode>,
)
