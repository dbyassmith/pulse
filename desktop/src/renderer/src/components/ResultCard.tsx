interface Props {
  text: string
  error?: string
  streaming?: boolean
  onDismiss: () => void
}

function ResultCard({ text, error, streaming, onDismiss }: Props): JSX.Element {
  const borderColor = error ? '#c0392b' : streaming ? '#3498db' : '#27ae60'
  const label = error ? 'Error' : streaming ? 'Thinking...' : 'Result'

  return (
    <div style={{ ...styles.card, borderLeft: `3px solid ${borderColor}` }}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        {!streaming && (
          <button onClick={onDismiss} style={styles.dismiss}>
            &times;
          </button>
        )}
      </div>
      <div style={styles.textContainer}>
        <p style={styles.text}>
          {error || text}
          {streaming && <span style={styles.cursor}>|</span>}
        </p>
      </div>
    </div>
  )
}

const styles = {
  card: {
    margin: '0 20px',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.7)',
    borderRadius: 8,
    flexShrink: 0,
    maxHeight: 200,
    display: 'flex',
    flexDirection: 'column' as const
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    flexShrink: 0
  } as React.CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    color: '#888',
    letterSpacing: 0.5
  } as React.CSSProperties,
  dismiss: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#888',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1
  } as React.CSSProperties,
  textContainer: {
    overflowY: 'auto' as const,
    flex: 1
  } as React.CSSProperties,
  text: {
    fontSize: 13,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const
  } as React.CSSProperties,
  cursor: {
    animation: 'blink 1s step-end infinite',
    color: '#3498db',
    fontWeight: 700
  } as React.CSSProperties
}

export default ResultCard
