import { useState } from 'react'

function SetupWizard({ onComplete }: { onComplete: () => void }): JSX.Element {
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)

  const handleSelect = async (): Promise<void> => {
    setSelecting(true)
    setError('')
    const result = await window.api.config.selectRepoPath()
    setSelecting(false)
    if (result.error) {
      setError(result.error)
    } else if (result.path) {
      onComplete()
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Setup</h1>
        <p style={styles.desc}>
          Select the Pulse repo directory so the app can run agent commands.
        </p>
        {error && <p style={styles.error}>{error}</p>}
        <button onClick={handleSelect} disabled={selecting} style={styles.button}>
          {selecting ? 'Selecting...' : 'Choose Directory'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#F8EDD9',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
  } as React.CSSProperties,
  card: {
    width: 300,
    padding: 32,
    textAlign: 'center' as const
  } as React.CSSProperties,
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: '0 0 8px',
    color: '#1a1a1a'
  } as React.CSSProperties,
  desc: {
    fontSize: 14,
    color: '#666',
    margin: '0 0 20px',
    lineHeight: 1.5
  } as React.CSSProperties,
  button: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    background: '#1a1a1a',
    color: '#fff',
    cursor: 'pointer'
  } as React.CSSProperties,
  error: {
    color: '#c0392b',
    fontSize: 13,
    margin: '0 0 12px'
  } as React.CSSProperties
}

export default SetupWizard
