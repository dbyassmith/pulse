import { useEffect, useRef } from 'react'

interface Props {
  visible: boolean
  userMessage: string
  statusMessages: string[]
  responseText: string
  streaming: boolean
  error?: string
  onClose: () => void
  onCancel: () => void
}

function ChatPane({
  visible,
  userMessage,
  statusMessages,
  responseText,
  streaming,
  error,
  onClose,
  onCancel
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [statusMessages, responseText])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && visible) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          ...styles.backdrop,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none'
        }}
        onClick={!streaming ? onClose : undefined}
      />

      {/* Pane */}
      <div
        style={{
          ...styles.pane,
          transform: visible ? 'translateY(0)' : 'translateY(100%)'
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          {streaming && (
            <button onClick={onCancel} style={styles.cancelBtn}>
              Cancel
            </button>
          )}
          <span style={styles.headerTitle}>{streaming ? 'Working...' : 'Result'}</span>
          <button onClick={onClose} style={styles.closeBtn}>
            &times;
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={styles.messages}>
          {/* User message */}
          {userMessage && (
            <div style={styles.userRow}>
              <div style={styles.userBubble}>{userMessage}</div>
            </div>
          )}

          {/* Status messages */}
          {statusMessages.map((msg, i) => (
            <div key={i} style={styles.statusRow}>
              <span style={styles.statusText}>{msg}</span>
            </div>
          ))}

          {/* Claude response */}
          {(responseText || error) && (
            <div style={styles.claudeRow}>
              <div
                style={{
                  ...styles.claudeBubble,
                  borderLeft: error
                    ? '3px solid #c0392b'
                    : streaming
                      ? '3px solid #3498db'
                      : '3px solid #27ae60'
                }}
              >
                {error || responseText}
                {streaming && <span style={styles.cursor}>|</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    transition: 'opacity 0.3s ease-out',
    zIndex: 10
  } as React.CSSProperties,
  pane: {
    position: 'fixed' as const,
    left: 0,
    right: 0,
    bottom: 0,
    top: 48,
    background: '#F8EDD9',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 20,
    transition: 'transform 0.3s ease-out',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.15)'
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(0,0,0,0.08)',
    flexShrink: 0,
    position: 'relative' as const
  } as React.CSSProperties,
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#666'
  } as React.CSSProperties,
  closeBtn: {
    position: 'absolute' as const,
    right: 16,
    background: 'none',
    border: 'none',
    fontSize: 22,
    color: '#888',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 4px'
  } as React.CSSProperties,
  cancelBtn: {
    position: 'absolute' as const,
    left: 16,
    background: 'none',
    border: 'none',
    fontSize: 13,
    color: '#c0392b',
    cursor: 'pointer',
    fontWeight: 500
  } as React.CSSProperties,
  messages: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12
  } as React.CSSProperties,
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end'
  } as React.CSSProperties,
  userBubble: {
    background: '#1a1a1a',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 14,
    borderTopRightRadius: 4,
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: '80%',
    whiteSpace: 'pre-wrap' as const
  } as React.CSSProperties,
  statusRow: {
    display: 'flex',
    justifyContent: 'center'
  } as React.CSSProperties,
  statusText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic' as const
  } as React.CSSProperties,
  claudeRow: {
    display: 'flex',
    justifyContent: 'flex-start'
  } as React.CSSProperties,
  claudeBubble: {
    background: 'rgba(255,255,255,0.8)',
    padding: '10px 14px',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: '90%',
    whiteSpace: 'pre-wrap' as const,
    color: '#1a1a1a'
  } as React.CSSProperties,
  cursor: {
    animation: 'blink 1s step-end infinite',
    color: '#3498db',
    fontWeight: 700
  } as React.CSSProperties
}

export default ChatPane
