import { describe, expect, it, vi } from 'vitest'
import { resolveGoogleMapsLink } from '../../src/shared/google-maps-link'

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

describe('resolveGoogleMapsLink', () => {
  it.each([
    ['https://www.google.com/maps?q=25.033964,121.564472', 25.033964, 121.564472],
    ['https://maps.google.com/?query=-33.8688,151.2093', -33.8688, 151.2093],
    ['https://www.google.com/maps/place/Taipei/@25.033964,121.564472,17z', 25.033964, 121.564472],
    ['https://www.google.com/maps/data=!4d121.564472!3d25.033964', 25.033964, 121.564472]
  ])('extracts coordinates from %s', async (url, lat, lng) => {
    await expect(resolveGoogleMapsLink(url)).resolves.toEqual({ ok: true, lat, lng })
  })

  it('follows the provided goo.gl redirect shape', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://maps.google.com/maps'))
      .mockResolvedValueOnce(redirect('https://www.google.com/maps?q=62.015955,-6.853447&entry=gps'))

    await expect(resolveGoogleMapsLink(
      'https://goo.gl/maps/24gF1HXWyAAmK1SQ8',
      { fetchImpl }
    )).resolves.toEqual({ ok: true, lat: 62.015955, lng: -6.853447 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('supports maps.app.goo.gl share tokens', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://www.google.com/maps/place/Test/@35.1,139.2,15z'))

    await expect(resolveGoogleMapsLink(
      'https://maps.app.goo.gl/Abc_123-x',
      { fetchImpl }
    )).resolves.toEqual({ ok: true, lat: 35.1, lng: 139.2 })
  })

  it.each([
    'http://goo.gl/maps/abc',
    'https://maps.app.goo.gl/',
    'https://maps.app.goo.gl/a/b',
    'https://www.google.com.evil.example/maps?q=1,2',
    'https://user@www.google.com/maps?q=1,2',
    'https://www.google.com:444/maps?q=1,2',
    'https://www.google.com/search?q=1,2'
  ])('rejects unsupported URL %s', async (url) => {
    await expect(resolveGoogleMapsLink(url)).resolves.toMatchObject({
      ok: false,
      code: 'unsupported-url'
    })
  })

  it('distinguishes missing and invalid coordinates', async () => {
    await expect(resolveGoogleMapsLink('https://www.google.com/maps/place/Taipei')).resolves.toMatchObject({
      ok: false,
      code: 'no-coordinates'
    })
    await expect(resolveGoogleMapsLink('https://www.google.com/maps?q=91,121')).resolves.toMatchObject({
      ok: false,
      code: 'invalid-coordinates'
    })
  })

  it('rejects redirects outside the allowlist', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://example.com/maps?q=1,2'))

    await expect(resolveGoogleMapsLink('https://goo.gl/maps/abc', { fetchImpl })).resolves.toMatchObject({
      ok: false,
      code: 'redirect-rejected'
    })
  })

  it('detects redirect loops', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://goo.gl/maps/def'))
      .mockResolvedValueOnce(redirect('https://goo.gl/maps/abc'))

    await expect(resolveGoogleMapsLink('https://goo.gl/maps/abc', { fetchImpl })).resolves.toMatchObject({
      ok: false,
      code: 'redirect-rejected'
    })
  })

  it('enforces the redirect limit', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://goo.gl/maps/def'))

    await expect(resolveGoogleMapsLink(
      'https://goo.gl/maps/abc',
      { fetchImpl, maxRedirects: 1 }
    )).resolves.toMatchObject({ ok: false, code: 'too-many-redirects' })
  })

  it('reports timeout without exposing the URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const result = await resolveGoogleMapsLink(
      'https://goo.gl/maps/secret-token',
      { fetchImpl, timeoutMs: 5 }
    )

    expect(result).toMatchObject({ ok: false, code: 'timeout' })
    expect(result.ok ? '' : result.message).not.toContain('secret-token')
  })

  it('reports network failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    await expect(resolveGoogleMapsLink('https://goo.gl/maps/abc', { fetchImpl })).resolves.toMatchObject({
      ok: false,
      code: 'network-error'
    })
  })
})
