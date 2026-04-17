import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api.ts'

const THEME_KEY = 'lemon-theme'

export function ThemeLoader() {
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  })

  // Sync server theme to localStorage for instant restore on reload
  useEffect(() => {
    if (config?.theme) {
      localStorage.setItem(THEME_KEY, config.theme)
    }
  }, [config?.theme])

  const theme = config?.theme || localStorage.getItem(THEME_KEY) || 'dark'

  useEffect(() => {
    const customStyle = document.getElementById('custom-theme') as HTMLStyleElement | null

    if (theme !== 'custom') {
      if (customStyle) {
        customStyle.remove()
      }

      const base = (import.meta as any).env?.VITE_API_BASE || ''
      const url = `${base}/themes/${encodeURIComponent(theme)}.css`

      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Theme ${theme} not found`)
          return res.text()
        })
        .then((css) => {
          let style = document.getElementById('theme-css') as HTMLStyleElement | null
          if (!style) {
            style = document.createElement('style')
            style.id = 'theme-css'
            document.head.appendChild(style)
          }
          style.textContent = css
        })
        .catch((err) => {
          console.error('Failed to load theme:', err)
        })
    }
  }, [theme])

  return null
}
