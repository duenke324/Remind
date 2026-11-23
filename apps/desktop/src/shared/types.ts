export interface User {
  id: string
  name: string
  email: string
  image?: string | null
}

export type AuthState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User; offline?: boolean }

/** Resposta das ações de conta. `code` é o código de erro do servidor (traduzido no ecrã). */
export type AuthResult<T = object> = ({ ok: true } & T) | { ok: false; code: string; message?: string }

export type SignInResult = AuthResult<{ next: 'otp' | 'done' }>

export type SocialProvider = 'google' | 'github'

/** Página tal como é guardada localmente e no servidor. */
export interface Page {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  cover: string | null
  sort: number
  favorite: boolean
  trashedAt: string | null
  content: unknown[]
  createdAt: string
  updatedAt: string
}

export interface ApiResponse<T = unknown> {
  status: number
  data: T | null
}
