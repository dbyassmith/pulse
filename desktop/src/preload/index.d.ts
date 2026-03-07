interface PulseAPI {
  auth: {
    login: (email: string, password: string) => Promise<{ user?: unknown; error?: string }>
    logout: () => Promise<void>
    getSession: () => Promise<{ session: unknown | null }>
  }
  dates: {
    list: () => Promise<{
      dates?: Array<{
        id: string
        title: string
        date: string
        confidence: string
        source?: string
        notes?: string
      }>
      error?: string
    }>
  }
  config: {
    get: () => Promise<{ repoPath?: string }>
    setRepoPath: (p: string) => Promise<{ ok: boolean }>
    selectRepoPath: () => Promise<{ path: string | null; error?: string }>
  }
  claude: {
    available: () => Promise<{ available: boolean }>
    run: (prompt: string) => Promise<{ started?: boolean; error?: string }>
    cancel: () => Promise<{ ok: boolean }>
    onProgress: (cb: (event: { type: string; text: string }) => void) => () => void
    onDone: (cb: (result: { text: string; error?: string }) => void) => () => void
  }
  onFocus: (cb: () => void) => () => void
}

declare global {
  interface Window {
    api: PulseAPI
  }
}
