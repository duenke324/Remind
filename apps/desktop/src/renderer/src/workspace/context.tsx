import { createContext, useContext } from 'react'
import type { User } from '../../../shared/types'
import type { PageStore } from '../data/store'
import type { LocalPage } from '../data/sync-logic'
import type { SyncStatus } from '../data/sync'

export interface WorkspaceValue {
  user: User
  store: PageStore
  pages: LocalPage[]
  loaded: boolean
  currentId: string | null
  open: (id: string | null) => void
  createPage: (parentId?: string | null) => Promise<void>
  syncStatus: SyncStatus
  offline: boolean
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('WorkspaceContext em falta')
  return value
}
