import { useState, FormEvent } from 'react'

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
        <h1 style={styles.title}>Pulse</h1>
        <p style={styles.subtitle}>Sign in to continue</p>
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
    margin: '0 0 4px',
    color: '#1a1a1a'
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: '0 0 24px'
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
