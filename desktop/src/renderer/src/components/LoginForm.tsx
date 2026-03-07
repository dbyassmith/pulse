import { useState, useEffect, useRef, FormEvent } from 'react'

function OrangeDot(): JSX.Element {
  const dotRef = useRef<HTMLSpanElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  const vel = useRef({ x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3 })
  const bounds = 14

  useEffect(() => {
    let raf: number
    const animate = (): void => {
      pos.current.x += vel.current.x
      pos.current.y += vel.current.y
      if (pos.current.x < -bounds) vel.current.x = Math.abs(vel.current.x)
      if (pos.current.x > 0) vel.current.x = -Math.abs(vel.current.x)
      if (pos.current.y < 0) vel.current.y = Math.abs(vel.current.y)
      if (pos.current.y > bounds) vel.current.y *= -1
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`
      }
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <span
      ref={dotRef}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#F28C38',
        marginRight: 6,
        verticalAlign: 'middle',
        position: 'relative',
        top: -8
      }}
    />
  )
}

function LoginForm({ onLogin }: { onLogin: () => void }): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await window.api.auth.login(email, password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      onLogin()
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}><OrangeDot side="left" />Goldfish</h1>
<form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
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
    margin: 0,
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
    margin: '0 0 24px',
    color: '#1a1a1a'
  } as React.CSSProperties,
  input: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    marginBottom: 12,
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    background: '#fff',
    boxSizing: 'border-box' as const,
    outline: 'none'
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
    cursor: 'pointer',
    marginTop: 4
  } as React.CSSProperties,
  error: {
    color: '#c0392b',
    fontSize: 13,
    margin: '0 0 12px'
  } as React.CSSProperties
}

export default LoginForm
