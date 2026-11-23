import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * Cena do topo: os blocos de uma página (título, parágrafos, tarefas, imagem) chegam de todo o lado,
 * montam-se numa página e ficam a flutuar. O rato inclina a página; o scroll volta a separá-los.
 */

interface BlockSpec {
  w: number
  h: number
  x: number
  y: number
  kind: 'title' | 'text' | 'accent' | 'check' | 'image' | 'card'
}

// Layout da "página" montada (unidades da cena). Inspirado no logótipo: blocos empilhados.
const LAYOUT: BlockSpec[] = [
  { kind: 'card', w: 4.6, h: 5.9, x: 0, y: 0 },
  { kind: 'image', w: 4.1, h: 1.15, x: 0, y: 2.15 },
  { kind: 'title', w: 2.7, h: 0.42, x: -0.7, y: 1.05 },
  { kind: 'text', w: 3.9, h: 0.16, x: -0.1, y: 0.5 },
  { kind: 'text', w: 3.4, h: 0.16, x: -0.35, y: 0.22 },
  { kind: 'check', w: 0.26, h: 0.26, x: -1.82, y: -0.25 },
  { kind: 'text', w: 2.5, h: 0.16, x: -0.33, y: -0.25 },
  { kind: 'check', w: 0.26, h: 0.26, x: -1.82, y: -0.7 },
  { kind: 'text', w: 2.9, h: 0.16, x: -0.13, y: -0.7 },
  { kind: 'accent', w: 1.9, h: 0.42, x: -1.0, y: -1.35 },
  { kind: 'text', w: 3.9, h: 0.16, x: -0.1, y: -1.95 },
  { kind: 'text', w: 2.2, h: 0.16, x: -0.95, y: -2.25 }
]

const DEPTH: Record<BlockSpec['kind'], number> = { card: 0.12, image: 0.1, title: 0.16, text: 0.1, check: 0.16, accent: 0.2 }
const LAYER: Record<BlockSpec['kind'], number> = { card: 0, image: 0.14, title: 0.16, text: 0.14, check: 0.18, accent: 0.22 }

interface Block {
  mesh: Mesh
  home: Vector3
  from: Vector3
  fromRot: Vector3
  scatter: Vector3
  scatterRot: Vector3
  delay: number
  phase: number
}

function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

/** Gradiente da "imagem de capa" dentro da página 3D. */
function coverTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 144
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 512, 144)
  grad.addColorStop(0, '#22c1e8')
  grad.addColorStop(0.55, '#2f6feb')
  grad.addColorStop(1, '#5b3fd6')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 144)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** Sombra suave por baixo da página (mais barata do que sombras reais). */
function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(20, 30, 60, 0.35)')
  grad.addColorStop(1, 'rgba(20, 30, 60, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new CanvasTexture(c)
}

const ease = (t: number) => 1 - Math.pow(1 - MathUtils.clamp(t, 0, 1), 4)

export function mountHero(container: HTMLElement): () => void {
  if (!hasWebGL()) {
    container.classList.add('no-webgl')
    return () => {}
  }

  const reduced = prefersReducedMotion()
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.outputColorSpace = SRGBColorSpace
  container.appendChild(renderer.domElement)

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0, 15)

  scene.add(new HemisphereLight(0xffffff, 0x8aa4d6, 1.4))
  scene.add(new AmbientLight(0xffffff, 0.35))
  const key = new DirectionalLight(0xffffff, 2.2)
  key.position.set(4, 6, 8)
  scene.add(key)
  const rim = new DirectionalLight(0x7fb0ff, 1.6)
  rim.position.set(-6, -2, -4)
  scene.add(rim)

  const page = new Group()
  scene.add(page)

  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)

  const materials = {
    card: new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2, transparent: true, opacity: 0.92 }),
    text: new MeshPhysicalMaterial({ color: 0xc9d2e3, roughness: 0.4, clearcoat: 0.6 }),
    title: new MeshPhysicalMaterial({ color: 0x2c2b28, roughness: 0.3, clearcoat: 1 }),
    accent: new MeshPhysicalMaterial({ color: 0x2f6feb, roughness: 0.2, clearcoat: 1, emissive: new Color(0x1a3c9e), emissiveIntensity: 0.35 }),
    check: new MeshPhysicalMaterial({ color: 0x2f6feb, roughness: 0.25, clearcoat: 1 }),
    image: new MeshPhysicalMaterial({ map: coverTexture(), roughness: 0.3, clearcoat: 1 })
  }

  const applyTheme = () => {
    const dark = isDark()
    materials.card.color.set(dark ? 0x2a2a2c : 0xffffff)
    materials.card.opacity = dark ? 0.88 : 0.92
    materials.text.color.set(dark ? 0x4a4f5c : 0xc9d2e3)
    materials.title.color.set(dark ? 0xeceff4 : 0x2c2b28)
  }
  applyTheme()

  const blocks: Block[] = LAYOUT.map((spec, i) => {
    const geometry = new RoundedBoxGeometry(spec.w, spec.h, DEPTH[spec.kind], 4, Math.min(spec.h, spec.w) * (spec.kind === 'card' ? 0.06 : 0.45))
    const mesh = new Mesh(geometry, materials[spec.kind])
    const home = new Vector3(spec.x, spec.y, LAYER[spec.kind])
    // Cada bloco chega de uma direção diferente e, no scroll, afasta-se para outra.
    const angle = (i / LAYOUT.length) * Math.PI * 2 + 0.6
    const from = new Vector3(Math.cos(angle) * 9, Math.sin(angle) * 6, -4 - (i % 3) * 3)
    const scatter = new Vector3(Math.cos(angle) * (3 + (i % 4)), Math.sin(angle) * (2 + (i % 3)), 2 + (i % 5) * 0.8)
    if (spec.kind === 'card') scatter.set(0, 0, -2)
    mesh.position.copy(reduced ? home : from)
    page.add(mesh)
    return {
      mesh,
      home,
      from,
      fromRot: new Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() - 0.5),
      scatter,
      scatterRot: new Vector3((i % 2 ? 1 : -1) * 0.6, (i % 3) * 0.3 - 0.3, (i % 2 ? -1 : 1) * 0.25),
      delay: spec.kind === 'card' ? 0 : 0.12 + i * 0.07,
      phase: i * 0.9
    }
  })

  const shadow = new Mesh(new PlaneGeometry(9, 9), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }))
  shadow.position.set(0.4, -0.4, -1.2)
  page.add(shadow)

  // Inclinação base: página vista ligeiramente de lado, como um objeto pousado.
  page.rotation.set(-0.12, -0.38, 0.04)
  const baseRot = page.rotation.clone()

  let raf = 0
  /** Pede um novo desenho (se ainda não houver um pedido). */
  const invalidate = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  const onTheme = () => {
    applyTheme()
    invalidate()
  }
  const themeObserver = new MutationObserver(onTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onTheme)

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onPointer, { passive: true })

  let scroll = 0
  const onScroll = () => {
    const rect = container.getBoundingClientRect()
    // Com "reduzir movimento" a página não se desmonta ao fazer scroll.
    scroll = reduced ? 0 : MathUtils.clamp(-rect.top / Math.max(rect.height, 1), 0, 1)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  const resize = () => {
    const { width, height } = container.getBoundingClientRect()
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(height, 1)
    // Em ecrãs estreitos afasta a câmara para a página caber.
    camera.position.z = camera.aspect < 0.9 ? 21 : 15
    camera.updateProjectionMatrix()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()


  // Só anima quando está visível (poupa bateria).
  let visible = true
  const io = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    if (visible) invalidate()
  })
  io.observe(container)

  const start = performance.now()

  function frame(now: number) {
    raf = 0
    const t = (now - start) / 1000

    pointer.x += (pointer.tx - pointer.x) * 0.05
    pointer.y += (pointer.ty - pointer.y) * 0.05
    page.rotation.x = baseRot.x + pointer.y * 0.12 + scroll * 0.35
    page.rotation.y = baseRot.y + pointer.x * 0.22 + scroll * 0.5
    page.position.y = scroll * 1.2

    for (const b of blocks) {
      const p = reduced ? 1 : ease((t - b.delay) / 1.4)
      const float = reduced ? 0 : Math.sin(t * 0.9 + b.phase) * 0.04
      const s = ease(scroll * 1.3)
      b.mesh.position.set(
        MathUtils.lerp(b.from.x, b.home.x, p) + b.scatter.x * s,
        MathUtils.lerp(b.from.y, b.home.y, p) + float + b.scatter.y * s,
        MathUtils.lerp(b.from.z, b.home.z, p) + b.scatter.z * s
      )
      b.mesh.rotation.set(b.fromRot.x * (1 - p) + b.scatterRot.x * s, b.fromRot.y * (1 - p) + b.scatterRot.y * s, b.fromRot.z * (1 - p) + b.scatterRot.z * s)
    }

    renderer.render(scene, camera)
    if (visible && !reduced) raf = requestAnimationFrame(frame)
  }
  invalidate()
  // Com "reduzir movimento", não há animação contínua: só se volta a desenhar quando algo muda.
  if (reduced) window.addEventListener('scroll', invalidate, { passive: true })

  container.dataset.ready = 'true'

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('scroll', invalidate)
    media.removeEventListener('change', onTheme)
    observer.disconnect()
    themeObserver.disconnect()
    io.disconnect()
    renderer.dispose()
  }
}
