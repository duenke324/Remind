/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Pasta dos instaladores (por omissão, o repositório público de downloads). */
  readonly VITE_DOWNLOAD_BASE?: string
  /** Página de compra do Remind Pro (por omissão, https://api.remind.uno/pro). */
  readonly VITE_PRO_URL?: string
}
