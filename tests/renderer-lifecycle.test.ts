import { movementCommand, startMovement, cancelMovement } from '../src/renderer/lib/movement-commands'
import { settingsFingerprint } from '../src/renderer/lib/session-settings'
import { createRouteCompletion } from '../src/renderer/lib/route-completion'
import { describe, expect, it, vi } from 'vitest'
import { createJoystickSession, joystickStep } from '../src/renderer/lib/joystick-session'
import { DisplayEvents } from '../src/renderer/lib/display-events'
import { useRouteStore } from '../src/renderer/stores/route.store'
import { getDisplayedSerial, useDeviceStore } from '../src/renderer/stores/device.store'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
describe('joystick asynchronous ownership', () => {
  it('release after setup has started prevents a late start and stops original targets', async () => {
    const gate = deferred<{ok: boolean}>()
    const setupStarted = deferred<void>()
    const api = { enableMockLocation: vi.fn(() => { setupStarted.resolve(); return gate.promise }), startJoystick: vi.fn(async () => {}), stopJoystick: vi.fn(async () => {}) }
    const session = createJoystickSession(api, vi.fn())
    const targets = ['a']
    const pending = session.start(targets)
    await setupStarted.promise
    expect(api.enableMockLocation).toHaveBeenCalledWith('a')
    targets[0] = 'b'
    session.stop()
    gate.resolve({ok: true})
    await pending
    expect(api.startJoystick).not.toHaveBeenCalled()
    expect(api.stopJoystick).toHaveBeenCalledWith(['a'])
    expect(session.targets()).toBeUndefined()
  })
  it('release during start sends a compensating stop after start resolves', async () => {
    const gate = deferred<void>(), started = deferred<void>()
    const api = { enableMockLocation: vi.fn(async () => ({ok: true})), startJoystick: vi.fn(() => { started.resolve(); return gate.promise }), stopJoystick: vi.fn(async () => {}) }
    const session = createJoystickSession(api, vi.fn())
    const pending = session.start(['a'])
    await started.promise
    session.stop()
    gate.resolve()
    await pending
    await movementCommand(async () => {})
    expect(api.stopJoystick).toHaveBeenCalledTimes(1)
    expect(session.targets()).toBeUndefined()
  })
  it('failed mock setup cannot start movement', async () => {
    const report = vi.fn()
    const api = { enableMockLocation: vi.fn(async () => ({ok: false, error: 'denied'})), startJoystick: vi.fn(async () => {}), stopJoystick: vi.fn(async () => {}) }
    await createJoystickSession(api, report).start(['a'])
    expect(api.startJoystick).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalled()
  })
  it('uses elapsed time, normalizes diagonals and remains finite at a pole', () => {
    const straight = joystickStep({lat: 0, lng: 0}, 0, 1, 10, 1)
    const diagonal = joystickStep({lat: 0, lng: 0}, 1, 1, 10, 1)
    expect(Math.hypot(diagonal.lat, diagonal.lng)).toBeCloseTo(straight.lat, 8)
    expect(joystickStep({lat: 0,lng: 0}, 0,1,10,0.5).lat).toBeCloseTo(straight.lat / 2, 8)
    const polar = joystickStep({lat: 90, lng: 180},1,1,10,1)
    expect(Number.isFinite(polar.lng)).toBe(true)
    expect(polar.lat).toBeLessThanOrEqual(90)
  })
})
it('only the displayed selected member accepts events and reconnect resets revisions', () => {
  let owner = 'a'
  const events = new DisplayEvents(() => owner)
  const request = events.ticket()
  expect(events.accept({serial:'b',revision:99})).toBe(false)
  expect(events.accept({serial:'a',revision:10})).toBe(true)
  expect(request()).toBe(false)
  expect(events.accept({serial:'a',revision:9})).toBe(false)
  const old = events.ticket()
  events.reset()
  expect(old()).toBe(false)
  expect(events.accept({serial:'a',revision:1})).toBe(true)
  const selectionRequest = events.ticket()
  owner = 'b'
  expect(selectionRequest()).toBe(false)
})
it('display owner prefers active selected member and command targets are copied', () => {
  useDeviceStore.setState({activeDevice: 'b', selectedSerials:['a','b']})
  expect(getDisplayedSerial()).toBe('b')
  const targets = useDeviceStore.getState().getTargetSerials()
  targets.pop()
  expect(useDeviceStore.getState().selectedSerials).toEqual(['a','b'])
  useDeviceStore.setState({activeDevice:'c'})
  expect(getDisplayedSerial()).toBe('a')
})
it.each(['control','profile','loop'])('invalidates old road geometry on %s edits', (change) => {
  useRouteStore.setState({routeMode:'road-network', routeProfile:'walk', loop:false, waypoints:[{lat:1,lng:1},{lat:2,lng:2}], plannedWaypoints:[{lat:1,lng:1},{lat:2,lng:2}], planStatus:'success'})
  const store = useRouteStore.getState()
  if (change === 'control') store.addControlPoint({lat:3,lng:3})
  if (change === 'profile') store.setRouteProfile('drive')
  if (change === 'loop') store.setLoop(true)
  expect(useRouteStore.getState().waypoints).toEqual([])
  expect(useRouteStore.getState().planStatus).toBe('idle')
})

it('a remounted joystick waits for the old in-flight start and its stop before starting', async () => {
  const gate = deferred<void>(), started = deferred<void>()
  const calls: string[] = []
  let count = 0
  const api = {
    enableMockLocation: vi.fn(async () => ({ok:true})),
    startJoystick: vi.fn(async () => {
      calls.push(`start${++count}`)
      if (count === 1) { started.resolve(); await gate.promise }
    }),
    stopJoystick: vi.fn(async () => { calls.push('stop') })
  }
  const old = createJoystickSession(api, vi.fn())
  const first = old.start(['a'])
  await started.promise
  old.stop()
  const successor = createJoystickSession(api, vi.fn())
  const second = successor.start(['a'])
  expect(calls).toEqual(['start1'])
  gate.resolve()
  await Promise.all([first, second])
  expect(calls).toEqual(['start1', 'stop', 'start2'])
  expect(successor.targets()).toEqual(['a'])
  successor.stop()
  await movementCommand(async () => {})
})
it('actual route start orchestration compensates before a successor can start', async () => {
  const started = deferred<void>(), response = deferred<void>()
  const calls: string[] = []
  let cancelled = false
  const first = startMovement({
    cancelled: () => cancelled,
    prepare: async () => {},
    start: async () => { calls.push('play-old'); started.resolve(); await response.promise },
    cleanup: async () => { calls.push('pause-old') }
  })
  await started.promise
  cancelled = true
  const successor = startMovement({
    cancelled: () => false,
    prepare: async () => {},
    start: async () => { calls.push('play-new') },
    cleanup: async () => { calls.push('pause-new') }
  })
  expect(calls).toEqual(['play-old'])
  response.resolve()
  expect(await first).toBe(false)
  expect(await successor).toBe(true)
  expect(calls).toEqual(['play-old','pause-old','play-new'])
})
it('route setup already in flight cannot play after settings or ownership cancellation', async () => {
  const setup = deferred<void>(), started = deferred<void>()
  const play = vi.fn(async () => {})
  let cancelled = false
  const pending = startMovement({
    cancelled: () => cancelled,
    prepare: async () => { started.resolve(); await setup.promise },
    start: play,
    cleanup: vi.fn(async () => {})
  })
  await started.promise
  cancelled = true
  setup.resolve()
  expect(await pending).toBe(false)
  expect(play).not.toHaveBeenCalled()
})
it('session edit guard ignores route playback hydration but detects user settings edits', () => {
  const state = {speedMs:1.4, controlPoints:[], playing:false, progressFraction:0}
  const fingerprint = settingsFingerprint(state)
  expect(settingsFingerprint({...state, playing:true, progressFraction:0.5})).toBe(fingerprint)
  expect(settingsFingerprint({...state, speedMs:10})).not.toBe(fingerprint)
})
it('independent route completion uses its own GPS and targets once, regardless of display owner', async () => {
  const gps = deferred<{lat:number;lng:number}>()
  const api = {getRealLocation:vi.fn(() => gps.promise), routeReturnToGps:vi.fn(async () => {})}
  const completion = createRouteCompletion(api, () => ({returnOnFinish:true,speedMs:1.4}), vi.fn())
  useDeviceStore.setState({activeDevice:'b', selectedSerials:['b']})
  const finish = {serial:'a',revision:10,state:{playing:false,finishedNaturally:true}}
  completion.accept(finish); completion.accept(finish)
  expect(api.getRealLocation).toHaveBeenCalledExactlyOnceWith('a')
  gps.resolve({lat:3,lng:4})
  await gps.promise
  await movementCommand(async () => {})
  expect(api.routeReturnToGps).toHaveBeenCalledExactlyOnceWith(3,4,1.4,['a'])
})
it('a new route event invalidates deferred completion GPS for its predecessor', async () => {
  const gps = deferred<{lat:number;lng:number}>()
  const api = {getRealLocation:vi.fn(() => gps.promise), routeReturnToGps:vi.fn(async () => {})}
  const completion = createRouteCompletion(api, () => ({returnOnFinish:true,speedMs:1.4}), vi.fn())
  completion.accept({serial:'a',revision:10,state:{playing:false,finishedNaturally:true}})
  completion.accept({serial:'a',revision:11,state:{playing:true,finishedNaturally:false}})
  gps.resolve({lat:3,lng:4})
  await gps.promise
  await movementCommand(async () => {})
  expect(api.routeReturnToGps).not.toHaveBeenCalled()
})

it('Stop All cancels setup already started and a ready joystick session', async () => {
  const setup = deferred<{ok:boolean}>(), began = deferred<void>()
  const api = {
    enableMockLocation: vi.fn(() => { began.resolve(); return setup.promise }),
    startJoystick: vi.fn(async () => {}),
    stopJoystick: vi.fn(async () => {})
  }
  const session = createJoystickSession(api, vi.fn())
  const pending = session.start(['stop-all-target'])
  await began.promise
  cancelMovement()
  setup.resolve({ok:true})
  await pending
  await movementCommand(async () => {})
  expect(api.startJoystick).not.toHaveBeenCalled()
  await session.start(['stop-all-target'])
  expect(session.targets()).toEqual(['stop-all-target'])
  cancelMovement()
  expect(session.targets()).toBeUndefined()
  await movementCommand(async () => {})
  expect(api.stopJoystick).toHaveBeenCalledWith(['stop-all-target'])
  session.dispose()
})

it('shared route member finish events and hydration elect one GPS owner and return the group once', async () => {
  const gps = deferred<{lat:number;lng:number}>()
  const api = {getRealLocation:vi.fn(() => gps.promise), routeReturnToGps:vi.fn(async () => {})}
  const completion = createRouteCompletion(api, () => ({returnOnFinish:true,speedMs:1.4}), vi.fn())
  const state = {playing:false,finishedNaturally:true,serials:['b','a']}
  // B arrives first; A's event and a revisionless hydration arrive while GPS is delayed.
  completion.accept({serial:'b',revision:20,state})
  completion.accept({serial:'a',revision:20,state})
  completion.accept({serial:'b',state:{...state,serials:['a','b']}})
  expect(api.getRealLocation).toHaveBeenCalledExactlyOnceWith('a')
  gps.resolve({lat:3,lng:4})
  await gps.promise
  await movementCommand(async () => {})
  expect(api.routeReturnToGps).toHaveBeenCalledExactlyOnceWith(3,4,1.4,['a','b'])
  completion.dispose()
})

it('rejects delayed completion from an older shared membership', async () => {
  const api = { getRealLocation: vi.fn(async () => ({lat:3,lng:4})), routeReturnToGps: vi.fn(async () => {}) }
  const completion = createRouteCompletion(api, () => ({returnOnFinish:true,speedMs:1.4}), vi.fn())
  completion.accept({serial:'a',revision:30,state:{playing:true,finishedNaturally:false,serials:['a']}})
  completion.accept({serial:'b',revision:20,state:{playing:false,finishedNaturally:true,serials:['a','b']}})
  await movementCommand(async () => {})
  expect(api.getRealLocation).not.toHaveBeenCalled()
  completion.dispose()
})
