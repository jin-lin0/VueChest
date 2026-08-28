import { reactive } from 'vue'

export interface GamepadControlState {
  left: boolean
  right: boolean
  gas: boolean
  brake: boolean
  action: boolean
}

interface GamepadButtonState {
  action: boolean
  reset: boolean
  pause: boolean
}

interface RacingGamepadCallbacks {
  onAction: (player: number) => void
  onReset: (player: number) => void
  onPauseToggle: () => void
  onGasStart: (player: number) => void
}

const EMPTY_CONTROLS: GamepadControlState = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  action: false,
}

export function gamepadControlState(pad: Gamepad): GamepadControlState & GamepadButtonState {
  const axisX = Math.abs(pad.axes[0] ?? 0) > 0.18 ? (pad.axes[0] ?? 0) : 0
  return {
    left: axisX < -0.12 || Boolean(pad.buttons[14]?.pressed),
    right: axisX > 0.12 || Boolean(pad.buttons[15]?.pressed),
    gas: (pad.buttons[7]?.value ?? 0) > 0.12,
    brake: (pad.buttons[6]?.value ?? 0) > 0.12,
    action: Boolean(pad.buttons[0]?.pressed),
    reset: Boolean(pad.buttons[1]?.pressed),
    pause: Boolean(pad.buttons[9]?.pressed),
  }
}

export function useRacingGamepads(callbacks: RacingGamepadCallbacks) {
  const controls = reactive<[GamepadControlState, GamepadControlState]>([
    { ...EMPTY_CONTROLS },
    { ...EMPTY_CONTROLS },
  ])
  const previousButtons = new Map<number, GamepadButtonState>()

  function clearControl(index: number) {
    Object.assign(controls[index], EMPTY_CONTROLS)
  }

  function pollGamepads() {
    if (!navigator.getGamepads) return
    const connected = Array.from(navigator.getGamepads())
      .filter((pad): pad is Gamepad => Boolean(pad))
      .slice(0, 2)

    for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
      const pad = connected[playerIndex]
      if (!pad) {
        clearControl(playerIndex)
        continue
      }

      const next = gamepadControlState(pad)
      Object.assign(controls[playerIndex], next)
      const previous = previousButtons.get(pad.index) ?? {
        action: false,
        reset: false,
        pause: false,
      }
      const player = playerIndex + 1
      if (next.action && !previous.action) callbacks.onAction(player)
      if (next.reset && !previous.reset) callbacks.onReset(player)
      if (next.pause && !previous.pause) callbacks.onPauseToggle()
      if (next.gas) callbacks.onGasStart(player)
      previousButtons.set(pad.index, {
        action: next.action,
        reset: next.reset,
        pause: next.pause,
      })
    }
  }

  return { gamepadControls: controls, pollGamepads }
}
