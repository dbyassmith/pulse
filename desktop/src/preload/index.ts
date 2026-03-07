import { contextBridge, ipcRenderer } from 'electron'

const api = {
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', email, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:session')
  },
  dates: {
    list: () => ipcRenderer.invoke('dates:list')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setRepoPath: (p: string) => ipcRenderer.invoke('config:setRepoPath', p),
    selectRepoPath: () => ipcRenderer.invoke('config:selectRepoPath')
  },
  claude: {
    available: () => ipcRenderer.invoke('claude:available'),
    run: (prompt: string) => ipcRenderer.invoke('claude:run', prompt),
    cancel: () => ipcRenderer.invoke('claude:cancel'),
    onProgress: (cb: (event: { type: string; text: string }) => void) => {
      const handler = (_e: unknown, event: { type: string; text: string }): void => cb(event)
      ipcRenderer.on('claude:progress', handler)
      return () => ipcRenderer.removeListener('claude:progress', handler)
    },
    onDone: (cb: (result: { text: string; error?: string }) => void) => {
      const handler = (_e: unknown, result: { text: string; error?: string }): void => cb(result)
      ipcRenderer.on('claude:done', handler)
      return () => ipcRenderer.removeListener('claude:done', handler)
    }
  },
  onFocus: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('app:focus', handler)
    return () => ipcRenderer.removeListener('app:focus', handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.api = api
}
