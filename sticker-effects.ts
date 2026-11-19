const variants = ['burn', 'impact', 'shock', 'wind', 'slice', 'pixels', 'fold'] as const
let previous: typeof variants[number] | undefined

export function destroySticker(rect: DOMRect, color: string, title?: string | null) {
  const available = variants.filter(variant => variant !== previous)
  previous = available[Math.floor(Math.random() * available.length)]
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !rect.width || !rect.height) return

  const ghost = document.createElement('div')
  ghost.className = `sticker-ghost effect-${previous}`
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
    backgroundColor: color,
  })
  ghost.textContent = title ?? 'Пустой стикер'
  if (previous === 'slice') {
    ghost.dataset.title = ghost.textContent
    ghost.style.setProperty('--slice-paper', color)
  }
  document.body.append(ghost)
  ghost.addEventListener('animationend', event => {
    if (event.target === ghost && !event.pseudoElement) ghost.remove()
  })
  window.setTimeout(() => ghost.remove(), 1100)
}
