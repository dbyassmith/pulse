import { useEffect, useState } from 'react'

interface UpcomingDate {
  id: string
  title: string
  date: string
  confidence: string
  source?: string
  notes?: string
}

function DatesList(): JSX.Element {
  const [dates, setDates] = useState<UpcomingDate[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.dates.list().then((result) => {
      if (result.error) {
        setError(result.error)
      } else {
        setDates(result.dates ?? [])
      }
    })
  }, [])

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const confidenceColor = (c: string): string => {
    if (c === 'high') return '#27ae60'
    if (c === 'medium') return '#f39c12'
    return '#95a5a6'
  }

  if (error) {
    return <p style={styles.error}>{error}</p>
  }

  return (
    <div style={styles.list}>
      {dates.map((date) => (
        <div key={date.id} style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.dateTitle}>{date.title}</span>
            <span style={styles.dateDate}>{formatDate(date.date)}</span>
          </div>
          <span
            style={{
              ...styles.badge,
              background: confidenceColor(date.confidence)
            }}
          >
            {date.confidence}
          </span>
        </div>
      ))}
      {dates.length === 0 && <p style={styles.empty}>No upcoming dates</p>}
    </div>
  )
}

const styles = {
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 20px'
  } as React.CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(0,0,0,0.06)'
  } as React.CSSProperties,
  rowLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2
  } as React.CSSProperties,
  dateTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: '#1a1a1a'
  } as React.CSSProperties,
  dateDate: {
    fontSize: 13,
    color: '#888'
  } as React.CSSProperties,
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 10,
    textTransform: 'capitalize' as const
  } as React.CSSProperties,
  empty: {
    textAlign: 'center' as const,
    color: '#888',
    marginTop: 40,
    fontSize: 14
  } as React.CSSProperties,
  error: {
    color: '#c0392b',
    fontSize: 13,
    padding: '12px 20px'
  } as React.CSSProperties
}

export default DatesList
