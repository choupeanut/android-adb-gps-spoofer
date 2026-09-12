import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve('deploy-portainer.sh')
function simulate(build: string, migrationStatus = 0, extraEnv = '', stopFails = false, sourceEndpoint = 3) {
  const dir = mkdtempSync(join(tmpdir(), 'gps-deploy-test-'))
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin)
    const log = join(dir, 'calls')
    writeFileSync(join(dir, 'build-result'), build)
    writeFileSync(join(dir, '.env.deploy.local'), `PORTAINER_TOKEN=fake\nPORTAINER_URL=http://invalid.local\n${extraEnv}\n`)
    writeFileSync(join(bin, 'tar'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(bin, 'curl'), `#!/bin/bash
printf '%s\\n' "$*" >> "$SIM_DIR/calls"
case "$*" in
  */stop?*) ${stopFails ? "exit 22" : "echo '{}'"} ;;
  *docker/build*) cat "$SIM_DIR/build-result" ;;
  *containers/create*) echo '{"Id":"migration"}' ;;
  *migration/wait*) echo '{"StatusCode":${migrationStatus}}' ;;
  */api/stacks) echo '[{"Name":"pikmin-keep-web","Id":1,"EndpointId":${sourceEndpoint}}]' ;;
  *) echo '{}' ;;
esac
`, { mode: 0o755 })
    const result = spawnSync('bash', [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SIM_DIR: dir } })
    let calls = ''; try { calls = readFileSync(log, 'utf8') } catch {}
    return { status: result.status, output: result.stdout + result.stderr, calls }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
describe('Portainer deployment failure boundaries', () => {
  it('stops before stack mutation when Docker returns an HTTP-success error stream', () => {
    const result = simulate('{"stream":"building"}\n{"error":"compile failed"}\n')
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('Remote Docker build failed')
    expect(result.calls).not.toContain('/stop?')
    expect(result.calls).not.toContain('stacks/create')
  })
  it('does not deploy a replacement when volume migration fails', () => {
    const result = simulate('{"stream":"Successfully built"}\n', 1)
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('Data migration failed')
    expect(result.calls).not.toContain('stacks/create')
  })
  it('requires an explicit successful build completion', () => {
    for (const stream of ['', '{"stream":"building"}']) {
      const result = simulate(stream)
      expect(result.status).not.toBe(0)
      expect(result.calls).not.toContain('/stop?')
    }
  })
  it('aborts if the source stack cannot be stopped', () => {
    const result = simulate('{"stream":"Successfully built"}', 0, '', true)
    expect(result.status).not.toBe(0)
    expect(result.calls).not.toContain('containers/create')
  })
  it('rejects cross-endpoint migration before stopping the source', () => {
    const result = simulate('{"stream":"Successfully built"}', 0, '', false, 8)
    expect(result.status).not.toBe(0)
    expect(result.calls).not.toContain('/stop?')
  })
  it('deploys after successful build and migration', () => {
    const result = simulate('{"stream":"Successfully built"}')
    expect(result.status).toBe(0)
    expect(result.calls).toContain('stacks/create')
    expect(result.calls).toContain('.gps-migration-in-progress')
    expect(result.calls).toContain('test -f /old/pikmin-keep.db')
  })
  it('refuses an incomplete migration even when a partial database exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gps-migration-test-'))
    try {
      mkdirSync(join(dir, 'old')); mkdirSync(join(dir, 'new'))
      writeFileSync(join(dir, 'old/pikmin-keep.db'), 'source')
      writeFileSync(join(dir, 'new/pikmin-keep.db'), 'partial')
      writeFileSync(join(dir, 'new/.gps-migration-in-progress'), '')
      const command = readFileSync(script, 'utf8').match(/migration_command='([^']+)'/)![1]
        .replaceAll('/old', `${dir}/old`).replaceAll('/new', `${dir}/new`)
      const result = spawnSync('sh', ['-c', command], { encoding: 'utf8' })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Incomplete earlier migration')
      expect(readFileSync(join(dir, 'new/pikmin-keep.db'), 'utf8')).toBe('partial')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('rejects malformed configuration before network requests', () => {
    const result = simulate('{}', 0, 'APP_PORT=123abc')
    expect(result.status).not.toBe(0)
    expect(result.calls).toBe('')
  })
})
