import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { build } from 'vite'

describe('H2 EMS browser bundle', () => {
  it('bundles the public entry without Node runtime imports', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'h2-ems-browser-'))
    try {
      await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          emptyOutDir: false,
          lib: {
            entry: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
            formats: ['es'],
            fileName: 'h2-ems',
          },
          outDir: outputDirectory,
        },
      })
      const bundle = await readFile(join(outputDirectory, 'h2-ems.js'), 'utf8')
      assert.doesNotMatch(bundle, /node:[a-z-]+|createHash/)
      assert.match(bundle, /subtle\.digest/)
    } finally {
      await rm(outputDirectory, { force: true, recursive: true })
    }
  })
})
