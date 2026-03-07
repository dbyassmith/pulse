import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SESSION_DIR = path.join(os.homedir(), ".pulse");
const SESSION_FILE = path.join(SESSION_DIR, "session.json");

function ensureDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { mode: 0o700, recursive: true });
  }
}

function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>) {
  ensureDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export const fileStorage = {
  getItem(key: string): string | null {
    const store = readStore();
    return store[key] ?? null;
  },

  setItem(key: string, value: string): void {
    const store = readStore();
    store[key] = value;
    writeStore(store);
  },

  removeItem(key: string): void {
    const store = readStore();
    delete store[key];
    if (Object.keys(store).length === 0) {
      try {
        fs.unlinkSync(SESSION_FILE);
      } catch {
        // already gone
      }
    } else {
      writeStore(store);
    }
  },
};

export function deleteSessionFile() {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    // already gone
  }
}
