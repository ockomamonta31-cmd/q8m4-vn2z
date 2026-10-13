// Мелкие UI-примитивы страницы: появление по скроллу, набегающие счётчики,
// копирование ID. Всё уважает prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Значение добегают до итога; при reduce-motion или нулевой длительности — просто ставится число. */
export function Counter({ value, duration = 900, format = (n: number) => String(Math.round(n)), prefix = '', suffix = '', className }: {
  value: number
  duration?: number
  format?: (n: number) => string
  prefix?: string
  suffix?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement | null>(null)
  const [display, setDisplay] = useState(reduced || duration === 0 ? value : 0)

  useEffect(() => {
    if (reduced || duration === 0) { setDisplay(value); return }
    const node = ref.current
    if (!node) return
    let frame = 0
    let start = 0
    let running = false
    const run = () => {
      if (running) return
      running = true
      const step = (now: number) => {
        if (!start) start = now
        const p = Math.min(1, (now - start) / duration)
        const eased = 1 - (1 - p) ** 3
        setDisplay(value * eased)
        if (p < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { run(); observer.disconnect() } }, { threshold: .3 })
    observer.observe(node)
    // число не имеет права оставаться нулём: если наблюдатель не сработал
    // (фоновая вкладка, быстрая прокрутка, печать) — показываем итог
    const fallback = window.setTimeout(run, duration + 700)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.clearTimeout(fallback) }
  }, [value, duration, reduced])

  return <span className={className} ref={ref}>{prefix}{format(display)}{suffix}</span>
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API недоступен в небезопасном контексте — выделяем текст вручную
      const field = document.createElement('textarea')
      field.value = text
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      document.body.removeChild(field)
    }
    setDone(true)
    window.setTimeout(() => setDone(false), 1600)
  }

  return (
    <button type="button" className={`btn btn-q${done ? ' done' : ''}`} onClick={copy} aria-label={`Скопировать ${label ?? text}`}>
      {done ? <Icon.Check size={16} /> : <Icon.Copy size={16} />}
      {done ? 'Скопировано' : label ?? text}
    </button>
  )
}

/** Переключатель разделов с ролью tablist и поддержкой стрелок с клавиатуры. */
export function TabBar<T extends string>({ items, value, onChange, className }: {
  items: { id: T; label: string; icon?: React.ReactNode; disabled?: boolean; hint?: string; count?: string | null }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function moveFocus(from: number, dir: number) {
    const enabled = items.map((item, i) => ({ item, i })).filter(({ item }) => !item.disabled)
    if (!enabled.length) return
    const pos = enabled.findIndex((entry) => entry.i === from)
    const next = enabled[(pos + dir + enabled.length) % enabled.length]
    refs.current[items[next.i].id]?.focus()
    onChange(items[next.i].id)
  }

  return (
    <div className={`rail${className ? ` ${className}` : ''}`} role="tablist" aria-orientation="horizontal" onKeyDown={(e) => {
      const index = items.findIndex((item) => item.id === value)
      if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(index, 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(index, -1) }
    }}>
      {items.map((item) => (
        <button
          key={item.id}
          ref={(node) => { refs.current[item.id] = node }}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === value}
          aria-controls={`panel-${item.id}`}
          tabIndex={item.id === value ? 0 : -1}
          disabled={item.disabled}
          title={item.hint}
          className="rail-i"
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
          {item.count && <span className="cnt">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}
