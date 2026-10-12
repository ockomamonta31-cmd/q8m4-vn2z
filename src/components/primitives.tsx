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

/**
 * Появление секции при попадании во вьюпорт — один раз.
 * Страховочный таймер раскрывает блок, если IntersectionObserver не успел
 * или не вызван (печать, headless, странные вкладки в фоне): контент не
 * имеет права оставаться невидимым.
 */
export function Reveal({ children, className = '', as: Tag = 'section', delay = 0 }: {
  children: React.ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
  delay?: number
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    let done = false
    const reveal = () => { if (!done) { done = true; setShown(true) } }
    const timer = window.setTimeout(reveal, 1200)
    if (!('IntersectionObserver' in window)) { reveal(); return () => window.clearTimeout(timer) }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { reveal(); observer.disconnect() } },
      { threshold: 0 },
    )
    observer.observe(node)
    return () => { window.clearTimeout(timer); observer.disconnect() }
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={`reveal${shown ? ' in' : ''}${className ? ` ${className}` : ''}`}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}

/** Значение добегают до итога; при reduce-motion или нулевой длительности — просто ставится число. */
export function Counter({ value, duration = 900, format = (n: number) => String(Math.round(n)), prefix = '', suffix = '' }: {
  value: number
  duration?: number
  format?: (n: number) => string
  prefix?: string
  suffix?: string
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

  return <span ref={ref}>{prefix}{format(display)}{suffix}</span>
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
    <button type="button" className={`id-copy${done ? ' done' : ''}`} onClick={copy} aria-label={`Скопировать ${label ?? text}`}>
      {done ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
      {done ? 'Скопировано' : label ?? text}
    </button>
  )
}

/** Переключатель разделов с ролью tablist и поддержкой стрелок с клавиатуры. */
export function TabBar<T extends string>({ items, value, onChange, className }: {
  items: { id: T; label: string; icon?: React.ReactNode; disabled?: boolean; hint?: string }[]
  value: T
  onChange: (id: T) => void
  className: string
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
    <div className={className} role="tablist" aria-orientation="horizontal" onKeyDown={(e) => {
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
          className="subnav-tab"
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
