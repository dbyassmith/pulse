import { useEffect, useState, useRef } from 'react'
import DatesList from './DatesList'
import ChatInput from './ChatInput'
import ResultCard from './ResultCard'

interface Props {
  claudeAvailable: boolean
  onLogout: () => void
}

function Dashboard({ claudeAvailable, onLogout }: Props): JSX.Element {
  const [refreshKey, setRefreshKey] = useState(0)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [result, setResult] = useState<{ text: string; error?: string } | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const unsub = window.api.onFocus(() => {
      if (!running) setRefreshKey((k) => k + 1)
    })

    const unsubProgress = window.api.claude.onProgress((event) => {
      if (event.type === 'text') {
        setStreamingText(event.text)
      } else if (event.type === 'progress') {
        setProgress(event.text)
      }
    })

    const unsubDone = window.api.claude.onDone((res) => {
      setRunning(false)
      setProgress('')
      setStreamingText('')
      setResult(res)
      setRefreshKey((k) => k + 1)
    })

    cleanupRef.current = [unsub, unsubProgress, unsubDone]

    return () => {
      cleanupRef.current.forEach((fn) => fn())
    }
  }, [running])

  const handleSend = async (prompt: string): Promise<void> => {
    setResult(null)
    setStreamingText('')
    setRunning(true)
    setProgress('Starting...')
    const res = await window.api.claude.run(prompt)
    if (res.error) {
      setRunning(false)
      setProgress('')
      setResult({ text: '', error: res.error })
    }
  }

  const handleCancel = async (): Promise<void> => {
    await window.api.claude.cancel()
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Pulse</h1>
        <button onClick={onLogout} style={styles.logoutBtn}>
          Sign Out
        </button>
      </div>

      <DatesList key={refreshKey} />

      {/* Show streaming text while Claude is running */}
      {running && streamingText && (
        <ResultCard text={streamingText} streaming onDismiss={() => {}} />
      )}

      {/* Show final result after Claude finishes */}
      {!running && result && (
        <ResultCard
          text={result.text}
          error={result.error}
          onDismiss={() => setResult(null)}
        />
      )}

      {running && progress && (
        <div style={styles.progressBar}>
          <div style={styles.progressDot} />
          <span style={styles.progressText}>{progress}</span>
          <button onClick={handleCancel} style={styles.cancelBtn}>
            Cancel
          </button>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        disabled={running || !claudeAvailable}
        placeholder={
          !claudeAvailable
            ? 'Claude Code CLI not found — install it to chat'
            : running
              ? 'Working...'
              : 'Ask Pulse anything...'
        }
      />
    </div>
  )
}

const styles = {
  container: {
    height: '100vh',
    background: '#F8EDD9',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
    margin: 0
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 8px',
    WebkitAppRegion: 'drag',
    flexShrink: 0
  } as React.CSSProperties,
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
    color: '#1a1a1a'
  } as React.CSSProperties,
  logoutBtn: {
    background: 'none',
    border: 'none',
    fontSize: 13,
    color: '#888',
    cursor: 'pointer',
    WebkitAppRegion: 'no-drag'
  } as React.CSSProperties,
  progressBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    background: 'rgba(0,0,0,0.04)',
    flexShrink: 0
  } as React.CSSProperties,
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#f39c12',
    animation: 'pulse 1.5s ease-in-out infinite'
  } as React.CSSProperties,
  progressText: {
    fontSize: 13,
    color: '#666',
    flex: 1
  } as React.CSSProperties,
  cancelBtn: {
    background: 'none',
    border: 'none',
    fontSize: 12,
    color: '#c0392b',
    cursor: 'pointer'
  } as React.CSSProperties
}

export default Dashboard
