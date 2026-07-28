let cachedGeo: { country: string; city: string } | null = null

export async function getClientGeo() {
  if (cachedGeo) return cachedGeo

  const stored = sessionStorage.getItem('client_geo')
  if (stored) {
    try {
      cachedGeo = JSON.parse(stored)
      return cachedGeo
    } catch {
      sessionStorage.removeItem('client_geo')
    }
  }

  try {
    const res = await fetch('https://api.ip.sb/geoip', {
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json()
    if (data.country) {
      cachedGeo = { country: data.country, city: data.city || data.region || '' }
      sessionStorage.setItem('client_geo', JSON.stringify(cachedGeo))
      return cachedGeo
    }
  } catch {}
  return null
}

export function getGeoHeader(
  geo: { country: string; city: string } | null,
): Record<string, string> {
  if (!geo) return {}
  return { 'X-Client-Geo': `${geo.country},${geo.city}` }
}
