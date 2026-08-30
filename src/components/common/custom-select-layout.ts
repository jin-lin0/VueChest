export interface HorizontalDropdownLayout {
  left: number
  width: number
}

export interface VerticalDropdownLayout {
  maxHeight: number
  placement: 'top' | 'bottom'
  top: number
}

export function getHorizontalDropdownLayout(
  triggerLeft: number,
  triggerWidth: number,
  viewportWidth: number,
  viewportPadding = 8,
  dropdownMinWidth = 200,
): HorizontalDropdownLayout {
  const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2)
  const width = Math.min(Math.max(0, triggerWidth, dropdownMinWidth), availableWidth)
  const left = Math.min(
    Math.max(viewportPadding, triggerLeft),
    Math.max(viewportPadding, viewportWidth - width - viewportPadding),
  )
  return { left, width }
}

export function getVerticalDropdownLayout(
  triggerTop: number,
  triggerBottom: number,
  dropdownHeight: number,
  viewportTop: number,
  viewportHeight: number,
  viewportPadding = 8,
  dropdownGap = 8,
): VerticalDropdownLayout {
  const viewportBottom = viewportTop + viewportHeight
  const spaceBelow = Math.max(0, viewportBottom - viewportPadding - triggerBottom - dropdownGap)
  const spaceAbove = Math.max(0, triggerTop - viewportTop - viewportPadding - dropdownGap)
  const placement =
    spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove
      ? ('bottom' as const)
      : ('top' as const)
  const maxHeight = placement === 'bottom' ? spaceBelow : spaceAbove
  const visibleHeight = Math.min(Math.max(0, dropdownHeight), maxHeight)
  const top =
    placement === 'bottom'
      ? triggerBottom + dropdownGap
      : Math.max(viewportTop + viewportPadding, triggerTop - dropdownGap - visibleHeight)

  return { top, maxHeight, placement }
}
