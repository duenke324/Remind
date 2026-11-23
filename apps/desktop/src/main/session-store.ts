import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { User } from '../shared/types'

/**
 * Guarda o token da sessão cifrado pelo sistema (Keychain no macOS, DPAPI no Windows).
 * Se a cifra não estiver disponível (alguns Linux sem keyring), guarda com permissões só do utilizador.
 */
interface Stored {
  token: string
  user: User
}

const file = () => join(app.getPath('userData'), 'session.bin')

export function saveSession(data: Stored): void {
  const json = JSON.stringify(data)
  const payload = safeStorage.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('E1'), safeStorage.encryptString(json)])
    : Buffer.concat([Buffer.from('P1'), Buffer.from(json)])
  writeFileSync(file(), payload, { mode: 0o600 })
}

export function loadSession(): Stored | null {
  if (!existsSync(file())) return null
  try {
    const raw = readFileSync(file())
    const tag = raw.subarray(0, 2).toString()
    const body = raw.subarray(2)
    const json = tag === 'E1' ? safeStorage.decryptString(body) : tag === 'P1' ? body.toString() : null
    return json ? (JSON.parse(json) as Stored) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  rmSync(file(), { force: true })
}
