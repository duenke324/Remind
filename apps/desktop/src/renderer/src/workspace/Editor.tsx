import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import type { PartialBlock } from '@blocknote/core'
import { en as enLocale, pt as ptLocale } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useI18n } from '../i18n'
import { useSettings } from '../settings'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const SAVE_DELAY_MS = 400

export interface EditorHandle {
  focusStart: () => void
}

interface Props {
  content: unknown[]
  /** A página não tem alterações locais por enviar (pode receber conteúdo de outro dispositivo). */
  clean: boolean
  readOnly: boolean
  onChange: (content: unknown[]) => void
}

/** Imagens ficam dentro da página (até 2 MB). */
function readAsDataUrl(file: File, tooLarge: string): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) return Promise.reject(new Error(tooLarge))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ content, clean, readOnly, onChange }, ref) {
  const { lang, t } = useI18n()
  const { resolvedTheme } = useSettings()
  const lastJson = useRef(JSON.stringify(content))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<unknown[] | null>(null)

  const editor = useCreateBlockNote({
    initialContent: content.length ? (content as PartialBlock[]) : undefined,
    dictionary: lang === 'pt' ? ptLocale : enLocale,
    uploadFile: (file: File) => readAsDataUrl(file, t('ws.imageTooLarge')),
    tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true }
  })

  useImperativeHandle(ref, () => ({
    focusStart: () => {
      const first = editor.document[0]
      if (first) editor.setTextCursorPosition(first, 'start')
      editor.focus()
    }
  }))

  // Guarda as alterações pendentes ao sair da página.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (pending.current) onChange(pending.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Conteúdo novo vindo de outro dispositivo: substitui, se não houver alterações locais por guardar.
  useEffect(() => {
    const json = JSON.stringify(content)
    if (!clean || pending.current || json === lastJson.current) return
    lastJson.current = json
    editor.replaceBlocks(editor.document, content.length ? (content as PartialBlock[]) : [{ type: 'paragraph' }])
  }, [content, clean, editor])

  return (
    <BlockNoteView
      editor={editor}
      editable={!readOnly}
      theme={resolvedTheme}
      className="editor"
      data-testid="editor"
      onChange={() => {
        const doc = editor.document as unknown[]
        pending.current = doc
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          const json = JSON.stringify(doc)
          pending.current = null
          if (json === lastJson.current) return
          lastJson.current = json
          onChange(doc)
        }, SAVE_DELAY_MS)
      }}
    />
  )
})
