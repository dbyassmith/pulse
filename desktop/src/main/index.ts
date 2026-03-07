import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const SUPABASE_URL = 'https://onlwcorsbauphzzmceru.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_jEKJ1zPdE8XZE_5RVYtGUg_N2Wy6phb'

const SESSION_DIR = path.join(os.homedir(), '.pulse')
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

const SYSTEM_PROMPT = `You are the Pulse agent. Read agent/CLAUDE.md for full system reference.
Use "pulse date add" for adding confirmed dates. Always use --confidence high --source personal for personal dates.
ID convention: lowercase, hyphens, no special chars (e.g., "WWDC 2026" -> wwdc-2026).
Never ask for confirmation — execute immediately.
For web searches, use WebSearch tool to find dates, then add via "pulse date add".
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
    'Bash(pulse:*),Read,Write,WebSearch,Glob,Grep,Edit',
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

  // Track current content blocks by index
  let currentToolName = ''
  let currentToolInput = ''

  child.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const streamEvent = JSON.parse(line)

        // Unwrap the StreamEvent envelope
        if (streamEvent.type !== 'stream_event' || !streamEvent.event) continue
        const apiEvent = streamEvent.event

        switch (apiEvent.type) {
          case 'content_block_start': {
            const block = apiEvent.content_block
            if (block?.type === 'tool_use') {
              currentToolName = block.name ?? ''
              currentToolInput = ''
              onProgress({ type: 'progress', text: toolNameToProgress(currentToolName) })
            }
            break
          }

          case 'content_block_delta': {
            const delta = apiEvent.delta
            if (delta?.type === 'text_delta' && delta.text) {
              resultText += delta.text
              onProgress({ type: 'text', text: resultText })
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
              currentToolInput += delta.partial_json
            }
            break
          }

          case 'content_block_stop': {
            // When a tool_use block completes, show the parsed input for context
            if (currentToolName === 'Bash' && currentToolInput) {
              try {
                const parsed = JSON.parse(currentToolInput)
                const cmd = parsed.command ?? ''
                if (cmd.startsWith('pulse')) {
                  onProgress({ type: 'progress', text: `Running: ${cmd}` })
                } else if (cmd) {
                  onProgress({ type: 'progress', text: `Running: ${cmd.slice(0, 80)}${cmd.length > 80 ? '...' : ''}` })
                }
              } catch {
                // couldn't parse tool input
              }
            }
            currentToolName = ''
            currentToolInput = ''
            break
          }
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
      title: 'Select Pulse repo directory'
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    const selected = result.filePaths[0]

    // Validate: check for .claude/ and cli/ directories
    const hasClaudeDir = fs.existsSync(path.join(selected, '.claude'))
    const hasCliDir = fs.existsSync(path.join(selected, 'cli'))
    if (!hasClaudeDir || !hasCliDir) {
      return { path: null, error: 'Not a valid Pulse repo (missing .claude/ or cli/ directory)' }
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
  electronApp.setAppUserModelId('com.pulse.desktop')

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
