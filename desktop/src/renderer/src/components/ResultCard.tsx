interface Props {
  text: string
  error?: string
  onDismiss: () => void
}

function ResultCard({ text, error, onDismiss }: Props): JSX.Element {
  return (
    <div style={{ ...styles.card, borderLeft: `3px solid ${error ? '#c0392b' : '#27ae60'}` }}>
      <div style={styles.header}>
        <span style={styles.label}>{error ? 'Error' : 'Result'}</span>
        <button onClick={onDismiss} style={styles.dismiss}>
          &times;
        </button>
      </div>
      <p style={styles.text}>{error || text}</p>
    </div>
  )
}

const styles = {
  card: {
    margin: '0 20px',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.7)',
    borderRadius: 8,
    flexShrink: 0
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
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
  text: {
    fontSize: 13,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const
  } as React.CSSProperties
}

export default ResultCard
