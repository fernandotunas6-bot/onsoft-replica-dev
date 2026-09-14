import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarConfigProvider } from '@/contexts/sidebar-context'
import { LanguageProvider } from '@/contexts/language-context'
import { AppRouter } from '@/components/router/app-router'
import { ErrorBoundary } from '@/components/error-boundary'
import { useEffect } from 'react'
import { initGTM } from '@/utils/analytics'

// Get basename from environment (for deployment) or use empty string for development
const basename = import.meta.env.VITE_BASENAME || ''

function App() {
  // Initialize GTM on app load
  useEffect(() => {
    initGTM();
  }, []);

  return (
    <div className="font-sans antialiased" style={{ fontFamily: 'var(--font-inter)' }}>
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
          <LanguageProvider>
            <SidebarConfigProvider>
              <Router basename={basename}>
                <AppRouter />
              </Router>
            </SidebarConfigProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </div>
  )
}

export default App
