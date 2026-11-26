import { describe, expect, it } from 'vitest'
import { findDeepLinkInArgv, parseDeepLink } from '../../src/shared/deep-link'

describe('parseDeepLink', () => {
  it('lê o retorno do login com os parâmetros', () => {
    expect(parseDeepLink('remind://auth/callback?code=abc123&state=xyz')).toEqual({
      kind: 'auth-callback',
      params: { code: 'abc123', state: 'xyz' }
    })
  })

  it('abre uma página pelo id', () => {
    expect(parseDeepLink('remind://page/9f1c2e')).toEqual({ kind: 'open-page', pageId: '9f1c2e' })
    expect(parseDeepLink('remind://calendar/connected')).toEqual({ kind: 'calendar-connected' })
    expect(parseDeepLink('remind://calendar/other')).toBeNull()
    expect(parseDeepLink('remind://pro/ativado')).toEqual({ kind: 'pro-activated' })
    expect(parseDeepLink('remind://pro/outra')).toBeNull()
  })

  it('rejeita outros protocolos', () => {
    expect(parseDeepLink('https://auth/callback?code=abc')).toBeNull()
    expect(parseDeepLink('javascript:alert(1)')).toBeNull()
    expect(parseDeepLink('file:///etc/passwd')).toBeNull()
  })

  it('rejeita caminhos desconhecidos e texto inválido', () => {
    expect(parseDeepLink('remind://settings/delete-all')).toBeNull()
    expect(parseDeepLink('remind://page/')).toBeNull()
    expect(parseDeepLink('remind://page/../../x')).toBeNull()
    expect(parseDeepLink('não é um url')).toBeNull()
    expect(parseDeepLink('')).toBeNull()
  })

  it('não aceita parâmetros repetidos no retorno do login', () => {
    expect(parseDeepLink('remind://auth/callback?code=a&code=b')).toBeNull()
  })
})

describe('findDeepLinkInArgv', () => {
  it('encontra o link nos argumentos do Windows', () => {
    const argv = ['C:\\Remind\\Remind.exe', '--flag', 'remind://page/abc']
    expect(findDeepLinkInArgv(argv)).toBe('remind://page/abc')
  })

  it('devolve null quando não há link', () => {
    expect(findDeepLinkInArgv(['Remind.exe', '--flag'])).toBeNull()
  })
})
