import { expect, it } from 'vitest'
import { attributionText } from '../../src/shared/attribution'
it('renders user attribution as text rather than active HTML', () => {
  expect(attributionText('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  expect(attributionText('© Example & contributors')).toBe('© Example &amp; contributors')
})
