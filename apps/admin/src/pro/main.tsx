import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import './pro.css'
import { ProPage } from './ProPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProPage />
  </StrictMode>
)
