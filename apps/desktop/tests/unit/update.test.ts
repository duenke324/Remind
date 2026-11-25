import { describe, expect, it } from 'vitest'
import { downloadUrlFor, isNewer, parseVersion, versionFromLatestRedirect } from '../../src/shared/update'

describe('atualizações', () => {
  it('compara versões', () => {
    expect(isNewer('0.1.6', '0.1.5')).toBe(true)
    expect(isNewer('v0.2.0', '0.1.9')).toBe(true)
    expect(isNewer('0.1.10', '0.1.9')).toBe(true)
    expect(isNewer('0.1.5', '0.1.5')).toBe(false)
    expect(isNewer('0.1.4', '0.1.5')).toBe(false)
    expect(isNewer('lixo', '0.1.5')).toBe(false)
    expect(parseVersion('1.2')).toBeNull()
  })

  it('lê a versão do redirecionamento de "releases/latest"', () => {
    expect(versionFromLatestRedirect('https://github.com/duenke324/Remind/releases/tag/v0.1.6')).toBe('0.1.6')
    expect(versionFromLatestRedirect('/duenke324/Remind/releases/tag/v1.0.0')).toBe('1.0.0')
    expect(versionFromLatestRedirect(null)).toBeNull()
    expect(versionFromLatestRedirect('https://evil.example/duenke324/Remind/releases/tag/v9.9.9')).toBeNull()
    expect(versionFromLatestRedirect('https://github.com/outro/repo/releases/tag/v9.9.9')).toBeNull()
    expect(versionFromLatestRedirect('https://github.com/duenke324/Remind/releases/tag/nightly')).toBeNull()
  })

  it('escolhe o instalador certo', () => {
    expect(downloadUrlFor('0.1.6', 'win32', 'x64')).toMatch(/\/download\/v0\.1\.6\/Remind-Setup\.exe$/)
    expect(downloadUrlFor('0.1.6', 'darwin', 'arm64')).toMatch(/Remind-arm64\.dmg$/)
    expect(downloadUrlFor('0.1.6', 'darwin', 'x64')).toMatch(/Remind-x64\.dmg$/)
    expect(downloadUrlFor('0.1.6', 'linux', 'x64')).toMatch(/\/tag\/v0\.1\.6$/)
  })
})
