import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RACING_SETTINGS } from '../game'
import { createRacingKeyboardControls, createRacingKeyboardHandlers } from '../keyboard'

const keyEvent = (key: string, repeat = false) => ({ key, repeat }) as KeyboardEvent

function setup(state: 'menu' | 'countdown' | 'playing' | 'paused' | 'result' = 'playing') {
  const controls = createRacingKeyboardControls()
  const events = {
    previous: vi.fn(),
    next: vi.fn(),
    gasStart: vi.fn(),
    action: vi.fn(),
    reset: vi.fn(),
    pause: vi.fn(),
  }
  const handlers = createRacingKeyboardHandlers({
    settings: {
      ...DEFAULT_RACING_SETTINGS,
      keyBindings: { ...DEFAULT_RACING_SETTINGS.keyBindings },
    },
    controls,
    getGameState: () => state,
    getGameMode: () => 'multi',
    onMenuPreviousCar: events.previous,
    onMenuNextCar: events.next,
    onPlayerOneGasStart: events.gasStart,
    onAction: events.action,
    onReset: events.reset,
    onPause: events.pause,
  })
  return { controls, events, handlers }
}

describe('racing keyboard handlers', () => {
  it('maps configured driving keys symmetrically on keydown and keyup', () => {
    const { controls, handlers } = setup()

    handlers.onKeyDown(keyEvent('w'))
    expect(controls.p1Gas).toBe(true)

    handlers.onKeyUp(keyEvent('w'))
    expect(controls.p1Gas).toBe(false)
  })

  it('uses arrow keys to change the menu car without activating driving controls', () => {
    const { controls, events, handlers } = setup('menu')

    handlers.onKeyDown(keyEvent('ArrowLeft'))

    expect(events.previous).toHaveBeenCalledOnce()
    expect(controls.p2Left).toBe(false)
  })

  it('routes one-shot action, reset and pause commands', () => {
    const { events, handlers } = setup()

    handlers.onKeyDown(keyEvent(' '))
    handlers.onKeyDown(keyEvent('r'))
    handlers.onKeyDown(keyEvent('Escape'))

    expect(events.action).toHaveBeenCalledWith(1)
    expect(events.reset).toHaveBeenCalledWith(1)
    expect(events.pause).toHaveBeenCalledOnce()
  })
})
