import { useState, FormEvent, KeyboardEvent } from 'react'

interface Props {
  onSend: (prompt: string) => void
  disabled: boolean
  placeholder: string
}

function ChatInput({ onSend, disabled, placeholder }: Props): JSX.Element {
  const [value, setValue] = useState('')

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          ...styles.input,
          opacity: disabled ? 0.5 : 1
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        style={{
          ...styles.button,
          opacity: disabled || !value.trim() ? 0.4 : 1
        }}
      >
        Send
      </button>
    </form>
  )
}

const styles = {
  form: {
    display: 'flex',
    gap: 8,
    padding: '14px 20px 18px',
    background: '#F0E2C8',
    borderTop: '1px solid rgba(0,0,0,0.06)',
    flexShrink: 0
  } as React.CSSProperties,
  input: {
    flex: 1,
    padding: '14px 16px',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 12,
    fontSize: 14,
    background: '#fff',
    outline: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
  } as React.CSSProperties,
  button: {
    padding: '14px 20px',
    border: 'none',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    background: '#1a1a1a',
    color: '#fff',
    cursor: 'pointer',
    flexShrink: 0
  } as React.CSSProperties
}

export default ChatInput
