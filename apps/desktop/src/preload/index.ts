import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DeepLink } from '../shared/deep-link'
import type { UpdateInfo } from '../shared/update'
import type { ApiResponse, AuthResult, AuthState, SignInResult, SocialProvider } from '../shared/types'

export interface AppInfo {
  version: string
  platform: string
  serverUrl: string
}

function on<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  onDeepLink: (listener: (link: DeepLink) => void) => on('deep-link', listener),

  updates: {
    check: (): Promise<{ status: 'available'; update: UpdateInfo } | { status: 'current'; version: string } | { status: 'error' }> =>
      ipcRenderer.invoke('update:check'),
    pending: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('update:pending'),
    onAvailable: (listener: (update: UpdateInfo) => void) => on('update:available', listener)
  },

  auth: {
    state: (): Promise<AuthState> => ipcRenderer.invoke('auth:state'),
    providers: (): Promise<SocialProvider[]> => ipcRenderer.invoke('auth:providers'),
    signUp: (input: { name: string; email: string; password: string }): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:sign-up', input),
    signIn: (input: { email: string; password: string }): Promise<SignInResult> => ipcRenderer.invoke('auth:sign-in', input),
    verifyOtp: (code: string): Promise<AuthResult> => ipcRenderer.invoke('auth:verify-otp', code),
    resendOtp: (): Promise<AuthResult> => ipcRenderer.invoke('auth:resend-otp'),
    resendVerification: (email: string): Promise<AuthResult> => ipcRenderer.invoke('auth:resend-verification', email),
    requestPasswordReset: (email: string): Promise<AuthResult> => ipcRenderer.invoke('auth:request-password-reset', email),
    startSocial: (provider: SocialProvider): Promise<AuthResult> => ipcRenderer.invoke('auth:start-social', provider),
    signOut: (): Promise<void> => ipcRenderer.invoke('auth:sign-out'),
    onChanged: (listener: () => void) => on('auth:changed', listener),
    onSocialResult: (listener: (result: AuthResult) => void) => on('auth:social-result', listener)
  },

  pages: {
    request: (method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<ApiResponse> =>
      ipcRenderer.invoke('api:request', method, path, body)
  },

  /** Outros pedidos ao servidor (conta, calendário). O processo principal só deixa passar os conhecidos. */
  api: {
    request: <T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<ApiResponse<T>> =>
      ipcRenderer.invoke('api:request', method, path, body)
  }
}

export type RemindApi = typeof api

contextBridge.exposeInMainWorld('remind', api)
