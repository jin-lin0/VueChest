import { describe, expect, it } from 'vitest'
import { gamepadControlState } from '../composables/useRacingGamepads'

function gamepad(
  buttonOverrides: Record<number, Partial<GamepadButton>> = {},
  axes = [0, 0, 0, 0],
): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: buttonOverrides[index]?.pressed ?? false,
    touched: buttonOverrides[index]?.touched ?? false,
    value: buttonOverrides[index]?.value ?? 0,
  }))
  return {
    id: 'test-pad',
    index: 0,
    connected: true,
    timestamp: 0,
    mapping: 'standard',
    axes,
    buttons,
    vibrationActuator: null,
  } as unknown as Gamepad
}

describe('racing gamepad mapping', () => {
  it('过滤摇杆死区并映射扳机', () => {
    const pad = gamepad({ 7: { value: 0.8 } }, [0.1, 0, 0, 0])
    expect(gamepadControlState(pad)).toMatchObject({ left: false, right: false, gas: true })
  })

  it('支持方向键、动作、重置和暂停按钮', () => {
    const pad = gamepad({
      14: { pressed: true },
      0: { pressed: true },
      1: { pressed: true },
      9: { pressed: true },
    })
    expect(gamepadControlState(pad)).toMatchObject({
      left: true,
      action: true,
      reset: true,
      pause: true,
    })
  })
})
