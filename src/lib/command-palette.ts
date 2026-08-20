export const COMMAND_PALETTE_EVENT = 'vuechest:open-command-palette'

export function openCommandPalette(query = '') {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT, { detail: { query } }))
}
