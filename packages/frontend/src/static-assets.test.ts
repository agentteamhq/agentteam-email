import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveClientStaticAssetPath } from './static-assets'

describe('resolveClientStaticAssetPath', () => {
  it('resolves existing Vite client files', async () => {
    expect.assertions(2)
    const clientDist = await createClientDist()

    await mkdir(join(clientDist, '_build'))
    await writeFile(join(clientDist, 'site.webmanifest'), '{}')
    await writeFile(join(clientDist, '_build', 'index.js'), 'export {}')

    await expect(resolveClientStaticAssetPath(clientDist, '/site.webmanifest')).resolves.toBe(
      '/site.webmanifest'
    )
    await expect(resolveClientStaticAssetPath(clientDist, '/_build/index.js')).resolves.toBe('/_build/index.js')
  })

  it('falls through for app routes, missing files, and directories', async () => {
    expect.assertions(3)
    const clientDist = await createClientDist()

    await mkdir(join(clientDist, 'signin'))

    await expect(resolveClientStaticAssetPath(clientDist, '/')).resolves.toBeNull()
    await expect(resolveClientStaticAssetPath(clientDist, '/signin/')).resolves.toBeNull()
    await expect(resolveClientStaticAssetPath(clientDist, '/missing-static.png')).resolves.toBeNull()
  })

  it('rejects invalid or escaping paths', async () => {
    expect.assertions(2)
    const clientDist = await createClientDist()

    await expect(resolveClientStaticAssetPath(clientDist, '/%E0%A4%A')).resolves.toBeNull()
    await expect(resolveClientStaticAssetPath(clientDist, '/%2e%2e/package.json')).resolves.toBeNull()
  })
})

async function createClientDist(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'atemail-frontend-static-'))
}
