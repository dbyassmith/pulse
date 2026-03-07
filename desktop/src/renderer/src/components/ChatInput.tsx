import { useState, useRef, useCallback, FormEvent, KeyboardEvent, ChangeEvent } from 'react'
import { ArrowUp } from 'lucide-react'

interface Props {
  onSend: (prompt: string) => void
  disabled: boolean
  placeholder: string
}

function ChatInput({ onSend, disabled, placeholder }: Props): JSX.Element {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
    requestAnimationFrame(autoResize)
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
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
            opacity: disabled || !value.trim() ? 0.3 : 1
          }}
        >
          <ArrowUp size={14} />
        </button>
      </div>
    </form>
  )
}

const styles = {
  form: {
    padding: '14px 20px 18px',
    background: '#F0E2C8',
    borderTop: '1px solid rgba(0,0,0,0.06)',
    flexShrink: 0
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    width: '100%'
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '14px 16px',
    paddingRight: 40,
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 12,
    fontSize: 14,
    background: '#fff',
    outline: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    resize: 'none',
    overflow: 'hidden',
    boxSizing: 'border-box' as const
  } as React.CSSProperties,
  button: {
    position: 'absolute' as const,
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 8,
    background: '#1a1a1a',
    color: '#fff',
    cursor: 'pointer',
    padding: 0
  } as React.CSSProperties
}

export default ChatInput
