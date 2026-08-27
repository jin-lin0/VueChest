export interface HorizontalDropdownLayout {
  left: number
  width: number
}

export function getHorizontalDropdownLayout(
  triggerLeft: number,
  triggerWidth: number,
  viewportWidth: number,
  viewportPadding = 8,
): HorizontalDropdownLayout {
  const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2)
  const width = Math.min(Math.max(0, triggerWidth), availableWidth)
  const left = Math.min(
    Math.max(viewportPadding, triggerLeft),
    Math.max(viewportPadding, viewportWidth - width - viewportPadding),
  )
  return { left, width }
}
