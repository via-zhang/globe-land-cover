import { useEffect, useState } from 'react'

/**
 * Mounts the detail panel once, on the side the viewport calls for.
 *
 * Rendering both the desktop rail and the mobile sheet and hiding one with
 * CSS would run two panels: two WebGL contexts for the panorama and two
 * rounds of Planetary Computer requests per selection.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}
