import './styles.css'

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

/** Onde estão os instaladores (nomes fixos em todas as versões). */
const DOWNLOAD_BASE = (import.meta.env.VITE_DOWNLOAD_BASE ?? 'https://github.com/duenke324/remind-downloads/releases/latest/download').replace(/\/+$/, '')
const FILES = {
  windows: 'Remind-Setup.exe',
  'mac-arm': 'Remind-arm64.dmg',
  'mac-intel': 'Remind-x64.dmg'
} as const
type Target = keyof typeof FILES

// ---------- Tema ----------
function currentTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme
  if (forced === 'light' || forced === 'dark') return forced
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function syncThemedImages(): void {
  const theme = currentTheme()
  document.querySelectorAll<HTMLImageElement>('[data-theme-img]').forEach((img) => {
    const src = img.dataset[theme]
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src)
  })
}

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem('remind.site.theme', next)
  } catch {
    /* só nesta visita */
  }
  syncThemedImages()
})
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemedImages)
syncThemedImages()

// ---------- Cena 3D (carregada à parte para a página aparecer logo) ----------
const hero = document.querySelector<HTMLElement>('[data-hero]')
if (hero) {
  void import('./hero3d').then(({ mountHero }) => mountHero(hero))
}

// ---------- Aparecer ao fazer scroll ----------
const revealer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in')
      revealer.unobserve(entry.target)
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
)
document.querySelectorAll<HTMLElement>('.reveal').forEach((el, i) => {
  // Elementos irmãos aparecem em cascata.
  el.style.setProperty('--delay', `${(i % 6) * 70}ms`)
  revealer.observe(el)
})

// ---------- Barra de navegação ----------
const nav = document.querySelector<HTMLElement>('[data-nav]')
const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 8)
window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

// ---------- Janela da app: endireita-se à medida que entra no ecrã ----------
const windowEl = document.querySelector<HTMLElement>('[data-tilt-on-scroll]')
if (windowEl && !reducedMotion) {
  const update = () => {
    const rect = windowEl.getBoundingClientRect()
    const progress = Math.min(Math.max(1 - (rect.top - window.innerHeight * 0.15) / (window.innerHeight * 0.85), 0), 1)
    windowEl.style.setProperty('--tilt', `${(1 - progress) * 24}deg`)
    windowEl.style.setProperty('--lift', `${(1 - progress) * 60}px`)
    windowEl.style.setProperty('--scale', `${0.9 + progress * 0.1}`)
  }
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  update()
}

// ---------- Cartões que inclinam com o rato ----------
if (!reducedMotion && matchMedia('(hover: hover)').matches) {
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      card.style.setProperty('--rx', `${-y * 10}deg`)
      card.style.setProperty('--ry', `${x * 12}deg`)
      card.style.setProperty('--mx', `${(x + 0.5) * 100}%`)
      card.style.setProperty('--my', `${(y + 0.5) * 100}%`)
    })
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg')
      card.style.setProperty('--ry', '0deg')
    })
  })
}

// ---------- Código OTP que muda (como um código novo a chegar) ----------
const otp = document.querySelector<HTMLElement>('[data-otp]')
if (otp && !reducedMotion) {
  const digits = [...otp.querySelectorAll('span')]
  setInterval(() => {
    digits.forEach((d, i) => {
      setTimeout(() => {
        d.classList.remove('flip')
        void d.offsetWidth
        d.classList.add('flip')
        d.textContent = String(Math.floor(Math.random() * 10))
      }, i * 90)
    })
  }, 3200)
}

// ---------- Downloads conforme o sistema do visitante ----------
function detectTarget(): Target | null {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // Os browsers não dizem de forma fiável o tipo de processador; Apple Silicon é a aposta mais provável hoje.
    return 'mac-arm'
  }
  return null
}

const LABEL: Record<Target, string> = { windows: 'Windows', 'mac-arm': 'macOS', 'mac-intel': 'macOS' }
const target = detectTarget()
document.querySelectorAll<HTMLAnchorElement>('[data-download]').forEach((a) => {
  const key = a.dataset.download as Target
  a.href = `${DOWNLOAD_BASE}/${FILES[key]}`
  if (key === target) a.classList.add('recommended')
})
const primary = document.querySelector<HTMLAnchorElement>('[data-download-primary]')
const hint = document.querySelector<HTMLElement>('[data-os-hint]')
if (target && primary) {
  primary.textContent = `Descarregar para ${LABEL[target]}`
  primary.href = `${DOWNLOAD_BASE}/${FILES[target]}`
}
if (hint) {
  hint.textContent =
    target === 'mac-arm'
      ? 'Mac com processador Intel (antes de 2020)? Usa o botão “Intel”.'
      : target
        ? 'Também disponível para os outros sistemas acima.'
        : 'Por agora o Remind existe para Windows e macOS.'
}
