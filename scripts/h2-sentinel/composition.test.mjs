import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const mainSourceUrl = new URL('../../apps/web/src/main.tsx', import.meta.url)

test('keeps H2 mode parsing inside the rejected bootstrap promise', async () => {
  const source = await readFile(mainSourceUrl, 'utf8')
  assert.match(source, /const bootstrap = async \(\): Promise<void> =>/)
  assert.match(source, /bootstrapH2Sentinel\(readH2Mode\(window\.location\)\)/)
  assert.match(source, /void bootstrap\(\)\.catch\(\(\) =>/)
})

test('keeps the explicit mode vocabulary closed', async () => {
  const source = await readFile(mainSourceUrl, 'utf8')
  assert.match(source, /mode !== 'fixture' && mode !== 'local'/)
  assert.match(source, /key !== 'mode'/)
})
