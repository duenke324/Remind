/// <reference types="vite/client" />
import type { RemindApi } from '../../preload'

declare global {
  interface Window {
    remind: RemindApi
  }
}
