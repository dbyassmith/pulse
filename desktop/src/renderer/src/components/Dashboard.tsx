import { useEffect, useState, useRef } from 'react'
import DatesList from './DatesList'
import WatchlistList from './WatchlistList'
import ChatInput from './ChatInput'
import ChatPane from './ChatPane'

interface Props {
  claudeAvailable: boolean
  onLogout: () => void
}

function Dashboard({ claudeAvailable, onLogout }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'watchlist'>('upcoming')
  const [refreshKey, setRefreshKey] = useState(0)
  const [running, setRunning] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [result, setResult] = useState<{ text: string; error?: string } | null>(null)
  const [userPrompt, setUserPrompt] = useState('')
  const [showPane, setShowPane] = useState(false)
  const [statusMessages, setStatusMessages] = useState<string[]>([])
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const unsub = window.api.onFocus(() => {
      if (!running) setRefreshKey((k) => k + 1)
    })

    const unsubProgress = window.api.claude.onProgress((event) => {
      if (event.type === 'text') {
        setStreamingText(event.text)
      } else if (event.type === 'progress') {
        setStatusMessages((prev) => [...prev, event.text])
      }
    })

    const unsubDone = window.api.claude.onDone((res) => {
      setRunning(false)
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
    setStatusMessages([])
    setUserPrompt(prompt)
    setShowPane(true)
    setRunning(true)
    const res = await window.api.claude.run(prompt)
    if (res.error) {
      setRunning(false)
      setResult({ text: '', error: res.error })
    }
  }

  const handleDismissPane = (): void => {
    if (running) {
      window.api.claude.cancel()
    }
    setShowPane(false)
    setUserPrompt('')
    setStatusMessages([])
    setResult(null)
    setStreamingText('')
    setRunning(false)
    setRefreshKey((k) => k + 1)
  }

  const handleCancel = async (): Promise<void> => {
    await window.api.claude.cancel()
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes swim {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={styles.swimDot} />
          Goldfish
        </h1>
        <button onClick={onLogout} style={styles.logoutBtn}>
          Sign Out
        </button>
      </div>

      <div style={styles.tabBar}>
        <button
          style={activeTab === 'upcoming' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming
        </button>
        <button
          style={activeTab === 'watchlist' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('watchlist')}
        >
          Watchlist
        </button>
      </div>

      {activeTab === 'upcoming' ? (
        <DatesList key={refreshKey} />
      ) : (
        <WatchlistList key={refreshKey} />
      )}

      <ChatPane
        visible={showPane}
        userMessage={userPrompt}
        statusMessages={statusMessages}
        responseText={running ? streamingText : (result?.text ?? '')}
        streaming={running}
        error={result?.error}
        onClose={handleDismissPane}
        onCancel={handleCancel}
      />

      <ChatInput
        onSend={handleSend}
        disabled={running || !claudeAvailable}
        placeholder={
          !claudeAvailable
            ? 'Claude Code CLI not found — install it to chat'
            : running
              ? 'Working...'
              : 'Ask Goldfish anything...'
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
    justifyContent: 'center',
    padding: '16px 20px 8px',
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    position: 'relative' as const
  } as React.CSSProperties,
  title: {
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
    color: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  } as React.CSSProperties,
  swimDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#FF8C00',
    display: 'inline-block',
    animation: 'swim 2s ease-in-out infinite'
  } as React.CSSProperties,
  logoutBtn: {
    background: 'none',
    border: 'none',
    fontSize: 13,
    color: '#888',
    cursor: 'pointer',
    WebkitAppRegion: 'no-drag',
    position: 'absolute' as const,
    right: 20
  } as React.CSSProperties,
  tabBar: {
    display: 'flex',
    gap: 0,
    padding: '0 20px',
    borderBottom: '1px solid rgba(0,0,0,0.08)',
    flexShrink: 0,
    WebkitAppRegion: 'no-drag'
  } as React.CSSProperties,
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    color: '#888',
    cursor: 'pointer'
  } as React.CSSProperties,
  tabActive: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #3498db',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    color: '#1a1a1a',
    cursor: 'pointer'
  } as React.CSSProperties
}

export default Dashboard
