import type { RacingSettings } from './game'

export interface RacingKeyboardControls {
  p1Left: boolean
  p1Right: boolean
  p1Gas: boolean
  p1Brake: boolean
  p1Action: boolean
  p2Left: boolean
  p2Right: boolean
  p2Gas: boolean
  p2Brake: boolean
  p2Action: boolean
}

type KeyboardControl = keyof RacingKeyboardControls

const KEY_BINDINGS: Array<{ binding: string; control: KeyboardControl }> = [
  { binding: 'p1Left', control: 'p1Left' },
  { binding: 'p1Right', control: 'p1Right' },
  { binding: 'p1Gas', control: 'p1Gas' },
  { binding: 'p1Brake', control: 'p1Brake' },
  { binding: 'p1Action', control: 'p1Action' },
  { binding: 'p2Left', control: 'p2Left' },
  { binding: 'p2Right', control: 'p2Right' },
  { binding: 'p2Gas', control: 'p2Gas' },
  { binding: 'p2Brake', control: 'p2Brake' },
  { binding: 'p2Action', control: 'p2Action' },
]

export function createRacingKeyboardControls(): RacingKeyboardControls {
  return {
    p1Left: false,
    p1Right: false,
    p1Gas: false,
    p1Brake: false,
    p1Action: false,
    p2Left: false,
    p2Right: false,
    p2Gas: false,
    p2Brake: false,
    p2Action: false,
  }
}

interface RacingKeyboardHandlerOptions {
  settings: RacingSettings
  controls: RacingKeyboardControls
  getGameState: () => 'menu' | 'countdown' | 'playing' | 'paused' | 'result'
  getGameMode: () => 'single' | 'multi'
  onMenuPreviousCar: () => void
  onMenuNextCar: () => void
  onPlayerOneGasStart: () => void
  onAction: (player: 1 | 2) => void
  onReset: (player: 1 | 2) => void
  onPause: () => void
}

export function createRacingKeyboardHandlers(options: RacingKeyboardHandlerOptions) {
  function applyKeyBinding(event: KeyboardEvent, value: boolean) {
    const binding = KEY_BINDINGS.find(
      (candidate) => options.settings.keyBindings[candidate.binding] === event.key,
    )
    if (binding) options.controls[binding.control] = value
  }

  function onKeyDown(event: KeyboardEvent) {
    const gameState = options.getGameState()
    if (gameState === 'menu') {
      if (event.key === 'ArrowLeft') {
        options.onMenuPreviousCar()
        return
      }
      if (event.key === 'ArrowRight') {
        options.onMenuNextCar()
        return
      }
    }

    if (event.key === options.settings.keyBindings.p1Gas) options.onPlayerOneGasStart()
    applyKeyBinding(event, true)

    if (!event.repeat && event.key === options.settings.keyBindings.p1Action) options.onAction(1)
    if (!event.repeat && event.key === options.settings.keyBindings.p2Action) options.onAction(2)
    if (
      !event.repeat &&
      gameState === 'playing' &&
      event.key === options.settings.keyBindings.p1Reset
    )
      options.onReset(1)
    if (
      !event.repeat &&
      gameState === 'playing' &&
      options.getGameMode() === 'multi' &&
      event.key === options.settings.keyBindings.p2Reset
    )
      options.onReset(2)

    if (event.key === 'Escape' && gameState === 'playing') options.onPause()
  }

  function onKeyUp(event: KeyboardEvent) {
    applyKeyBinding(event, false)
  }

  return { onKeyDown, onKeyUp }
}
