import { useEffect, useState } from 'react'

interface WatchlistItem {
  id: string
  title: string
  type: string
  category?: string
  subcategory?: string
  added?: string
  confidence_threshold?: string
  last_checked?: string
  notes?: string
}

function WatchlistList(): JSX.Element {
  const [items, setItems] = useState<WatchlistItem[]>([])

  useEffect(() => {
    window.api.watchlist.list().then((result) => {
      setItems(result.items ?? [])
    })
  }, [])

  const formatType = (type: string): string => {
    return type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div style={styles.list}>
      {items.map((item) => (
        <div key={item.id} style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.itemTitle}>{item.title}</span>
            <div style={styles.meta}>
              {item.category && (
                <span style={styles.badge}>
                  {item.subcategory ? `${item.category} / ${item.subcategory}` : item.category}
                </span>
              )}
              <span style={styles.type}>{formatType(item.type)}</span>
            </div>
          </div>
        </div>
      ))}
      {items.length === 0 && <p style={styles.empty}>No items being watched</p>}
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
    gap: 4
  } as React.CSSProperties,
  itemTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: '#1a1a1a'
  } as React.CSSProperties,
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  } as React.CSSProperties,
  badge: {
    fontSize: 11,
    fontWeight: 500,
    color: '#3498db',
    background: 'rgba(52,152,219,0.1)',
    padding: '2px 8px',
    borderRadius: 10
  } as React.CSSProperties,
  type: {
    fontSize: 13,
    color: '#888'
  } as React.CSSProperties,
  empty: {
    textAlign: 'center' as const,
    color: '#888',
    marginTop: 40,
    fontSize: 14
  } as React.CSSProperties
}

export default WatchlistList
