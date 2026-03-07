import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import matter from 'gray-matter'

const SUPABASE_URL = 'https://onlwcorsbauphzzmceru.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_jEKJ1zPdE8XZE_5RVYtGUg_N2Wy6phb'

const SESSION_DIR = path.join(os.homedir(), '.goldfish')
const SESSION_FILE = path.join(SESSION_DIR, 'session.json')
const CONFIG_FILE = path.join(SESSION_DIR, 'desktop-config.json')

// --- Config ---

interface AppConfig {
  repoPath?: string
  windowBounds?: { x: number; y: number; width: number; height: number }
}

function readConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfig(config: AppConfig): void {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { mode: 0o700, recursive: true })
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// --- Session storage (shared with CLI) ---

const fileStorage = {
  getItem(key: string): string | null {
    try {
      const raw = fs.readFileSync(SESSION_FILE, 'utf-8')
      const store = JSON.parse(raw)
      return store[key] ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { mode: 0o700, recursive: true })
    }
    let store: Record<string, string> = {}
    try {
      store = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'))
    } catch {
      // fresh store
    }
    store[key] = value
    fs.writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
  },
  removeItem(key: string): void {
    let store: Record<string, string> = {}
    try {
      store = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'))
    } catch {
      return
    }
    delete store[key]
    if (Object.keys(store).length === 0) {
      try {
        fs.unlinkSync(SESSION_FILE)
      } catch {
        /* already gone */
      }
    } else {
      fs.writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
    }
  }
}

// --- Supabase ---

let supabase: SupabaseClient

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: fileStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  }
  return supabase
}

// --- Claude subprocess ---

let activeProcess: ChildProcess | null = null

function claudeIsAvailable(): boolean {
  try {
    const { execSync } = require('child_process')
    execSync('which claude', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const SYSTEM_PROMPT = `You are the Goldfish agent. Read agent/CLAUDE.md for full system reference.
Use "goldfish date add" for adding confirmed dates. Always use --confidence high --source personal for personal dates.
ID convention: lowercase, hyphens, no special chars (e.g., "WWDC 2026" -> wwdc-2026).
Never ask for confirmation — execute immediately.
For web searches, use WebSearch tool to find dates, then add via "goldfish date add".
For watchlist items, create markdown files in agent/watchlist/ following the YAML frontmatter format.
Confidence tiers: high (official source), medium (reliable but unofficial), low (rumor/prediction).`

interface ClaudeEvent {
  type: 'progress' | 'text'
  text: string
}

function toolNameToProgress(toolName: string): string {
  if (toolName === 'WebSearch') return 'Searching the web...'
  if (toolName === 'Read') return 'Reading file...'
  if (toolName === 'Write' || toolName === 'Edit') return 'Writing file...'
  if (toolName === 'Grep' || toolName === 'Glob') return 'Searching codebase...'
  if (toolName === 'Bash') return 'Running command...'
  return `Using ${toolName}...`
}

function spawnClaude(
  prompt: string,
  repoPath: string,
  onProgress: (event: ClaudeEvent) => void,
  onDone: (result: { text: string; error?: string }) => void
): ChildProcess {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--append-system-prompt',
    SYSTEM_PROMPT,
    '--allowedTools',
    'Bash(goldfish:*),Read,Write,WebSearch,Glob,Grep,Edit',
    '--max-turns',
    '20'
  ]

  const child = spawn('claude', args, {
    cwd: repoPath,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  activeProcess = child
  let resultText = ''
  let buffer = ''
  let lastToolName = ''

  child.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)

        // Assistant message snapshots — contain content blocks
        if (event.type === 'assistant' && event.message?.content) {
          const content = event.message.content as Array<Record<string, unknown>>
          for (const block of content) {
            if (block.type === 'tool_use' && block.name) {
              const toolName = block.name as string
              if (toolName !== lastToolName) {
                lastToolName = toolName
                let progressText = toolNameToProgress(toolName)
                // Show bash command if available
                if (toolName === 'Bash' && block.input) {
                  const input = block.input as Record<string, string>
                  if (input.command) {
                    const cmd = input.command
                    progressText = `Running: ${cmd.slice(0, 80)}${cmd.length > 80 ? '...' : ''}`
                  }
                }
                onProgress({ type: 'progress', text: progressText })
              }
            }
            if (block.type === 'text' && block.text) {
              resultText = block.text as string
              onProgress({ type: 'text', text: resultText })
            }
          }
        }

        // Final result event
        if (event.type === 'result' && event.result) {
          resultText = event.result as string
          onProgress({ type: 'text', text: resultText })
        }
      } catch {
        // not valid JSON, skip
      }
    }
  })

  let stderrOutput = ''
  child.stderr?.on('data', (data: Buffer) => {
    stderrOutput += data.toString()
  })

  child.on('close', (code) => {
    activeProcess = null
    if (code === 0) {
      onDone({ text: resultText || 'Done.' })
    } else {
      onDone({ text: '', error: stderrOutput || `Claude exited with code ${code}` })
    }
  })

  child.on('error', (err) => {
    activeProcess = null
    onDone({ text: '', error: err.message })
  })

  return child
}

// --- Window ---

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const config = readConfig()
  const bounds = config.windowBounds ?? { width: 420, height: 600 }

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 400,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Save window bounds on move/resize
  const saveBounds = (): void => {
    if (!mainWindow) return
    const config = readConfig()
    config.windowBounds = mainWindow.getBounds()
    writeConfig(config)
  }
  mainWindow.on('resized', saveBounds)
  mainWindow.on('moved', saveBounds)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Auto-refresh dates on focus
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('app:focus')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- IPC handlers ---

function setupIPC(): void {
  // Auth
  ipcMain.handle('auth:login', async (_event, email: string, password: string) => {
    const sb = getSupabase()
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { user: data.user }
  })

  ipcMain.handle('auth:logout', async () => {
    const sb = getSupabase()
    await sb.auth.signOut()
  })

  ipcMain.handle('auth:session', async () => {
    const sb = getSupabase()
    const { data } = await sb.auth.getSession()
    return { session: data.session }
  })

  // Dates
  ipcMain.handle('dates:list', async () => {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('confirmed_dates')
      .select('*')
      .order('date', { ascending: true })
    if (error) return { error: error.message }
    return { dates: data }
  })

  // Watchlist
  ipcMain.handle('watchlist:list', async () => {
    const config = readConfig()
    if (!config.repoPath) return { items: [] }
    const watchlistDir = path.join(config.repoPath, 'agent', 'watchlist')
    try {
      if (!fs.existsSync(watchlistDir)) return { items: [] }
      const files = fs.readdirSync(watchlistDir).filter((f) => f.endsWith('.md'))
      const items = []
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(watchlistDir, file), 'utf-8')
          const { data } = matter(content)
          if (data.title && data.id) {
            items.push({
              id: data.id,
              title: data.title,
              type: data.type || 'one-time',
              category: data.category,
              added: data.added,
              confidence_threshold: data.confidence_threshold,
              last_checked: data.last_checked,
              notes: data.notes
            })
          }
        } catch {
          // skip malformed files
        }
      }
      return { items }
    } catch {
      return { items: [] }
    }
  })

  // Config
  ipcMain.handle('config:get', () => {
    return readConfig()
  })

  ipcMain.handle('config:setRepoPath', (_event, repoPath: string) => {
    const config = readConfig()
    config.repoPath = repoPath
    writeConfig(config)
    return { ok: true }
  })

  ipcMain.handle('config:selectRepoPath', async () => {
    if (!mainWindow) return { path: null }
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Goldfish repo directory'
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    const selected = result.filePaths[0]

    // Validate: check for .claude/ and cli/ directories
    const hasClaudeDir = fs.existsSync(path.join(selected, '.claude'))
    const hasCliDir = fs.existsSync(path.join(selected, 'cli'))
    if (!hasClaudeDir || !hasCliDir) {
      return { path: null, error: 'Not a valid Goldfish repo (missing .claude/ or cli/ directory)' }
    }

    const config = readConfig()
    config.repoPath = selected
    writeConfig(config)
    return { path: selected }
  })

  // Claude
  ipcMain.handle('claude:available', () => {
    return { available: claudeIsAvailable() }
  })

  ipcMain.handle('claude:run', (event, prompt: string) => {
    if (activeProcess) {
      return { error: 'A task is already running' }
    }

    const config = readConfig()
    if (!config.repoPath) {
      return { error: 'Repo path not configured' }
    }

    spawnClaude(
      prompt,
      config.repoPath,
      (progressEvent) => {
        mainWindow?.webContents.send('claude:progress', progressEvent)
      },
      (result) => {
        mainWindow?.webContents.send('claude:done', result)
      }
    )

    return { started: true }
  })

  ipcMain.handle('claude:cancel', () => {
    if (activeProcess) {
      activeProcess.kill('SIGTERM')
      setTimeout(() => {
        if (activeProcess) {
          activeProcess.kill('SIGKILL')
          activeProcess = null
        }
      }, 5000)
    }
    return { ok: true }
  })
}

// --- App lifecycle ---

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.goldfish.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup subprocess on quit
app.on('before-quit', () => {
  if (activeProcess) {
    activeProcess.kill('SIGTERM')
    setTimeout(() => {
      if (activeProcess) {
        activeProcess.kill('SIGKILL')
        activeProcess = null
      }
    }, 5000)
  }
})
