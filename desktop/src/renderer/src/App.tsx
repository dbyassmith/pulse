import { useEffect, useState } from 'react'
import LoginForm from './components/LoginForm'
import SetupWizard from './components/SetupWizard'
import Dashboard from './components/Dashboard'

type AppState = 'loading' | 'login' | 'setup' | 'ready'

function App(): JSX.Element {
  const [state, setState] = useState<AppState>('loading')
  const [claudeAvailable, setClaudeAvailable] = useState(true)

  useEffect(() => {
    init()
  }, [])

  const init = async (): Promise<void> => {
    // Check auth
    const { session } = await window.api.auth.getSession()
    if (!session) {
      setState('login')
      return
    }

    // Check claude availability
    const { available } = await window.api.claude.available()
    setClaudeAvailable(available)

    // Check repo path
    const config = await window.api.config.get()
    if (!config.repoPath) {
      setState('setup')
      return
    }

    setState('ready')
  }

  if (state === 'loading') {
    return (
      <div style={styles.container}>
        <p style={styles.loading}>Loading...</p>
      </div>
    )
  }

  if (state === 'login') {
    return <LoginForm onLogin={() => init()} />
  }

  if (state === 'setup') {
    return <SetupWizard onComplete={() => setState('ready')} />
  }

  return (
    <Dashboard
      claudeAvailable={claudeAvailable}
      onLogout={async () => {
        await window.api.auth.logout()
        setState('login')
      }}
    />
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#F8EDD9',
    margin: 0
  } as React.CSSProperties,
  loading: {
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    color: '#666'
  } as React.CSSProperties
}

export default App
