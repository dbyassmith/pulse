import { useEffect, useState } from 'react'
import {
  Monitor,
  Trophy,
  Film,
  Gamepad2,
  Cake,
  Plane,
  User,
  Briefcase,
  Star,
  Tag,
  type LucideIcon
} from 'lucide-react'

const categoryIcons: Record<string, LucideIcon> = {
  tech: Monitor,
  sports: Trophy,
  entertainment: Film,
  gaming: Gamepad2,
  birthday: Cake,
  travel: Plane,
  personal: User,
  business: Briefcase,
  holiday: Star
}

interface UpcomingDate {
  id: string
  title: string
  date: string
  confidence: string
  source?: string
  notes?: string
  category?: string
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

  const daysUntil = (dateStr: string): string => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr + 'T00:00:00')
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return '1 day'
    return `${diff} days`
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
            <div style={styles.dateMeta}>
              <span style={styles.dateDate}>{formatDate(date.date)}</span>
              {date.category && (() => {
                const Icon = categoryIcons[date.category] ?? Tag
                return (
                  <span style={styles.categoryBadge}>
                    <Icon size={11} />
                    {date.category.toUpperCase()}
                  </span>
                )
              })()}
            </div>
          </div>
          <span style={styles.daysUntil}>{daysUntil(date.date)}</span>
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
  dateMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6
  } as React.CSSProperties,
  dateDate: {
    fontSize: 13,
    color: '#888'
  } as React.CSSProperties,
  categoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    fontWeight: 500,
    color: '#888',
    background: 'rgba(0,0,0,0.05)',
    padding: '1px 5px',
    borderRadius: 8
  } as React.CSSProperties,
  daysUntil: {
    fontSize: 13,
    color: '#888',
    flexShrink: 0
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
