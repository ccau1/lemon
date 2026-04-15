import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api.ts'

export function ThemeLoader() {
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  })

  const theme = config?.theme || 'dark'

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
