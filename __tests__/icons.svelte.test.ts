import { mount, unmount } from 'svelte'
import { Icon } from '@steeze-ui/svelte-icon'
import { CheckCircle, XMark } from '@steeze-ui/heroicons'
import SpinnerIcon from '$lib/components/icons/SpinnerIcon.svelte'
import CircleIcon from '$lib/components/icons/CircleIcon.svelte'

describe('icons', () => {
  let target: HTMLElement
  let component: Record<string, any> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (component) unmount(component)
    component = undefined
    target.remove()
  })

  function renderedSvg() {
    const svg = target.querySelector('svg')
    expect(svg).not.toBeNull()
    return svg as SVGSVGElement
  }

  it('renders a Heroicon as inline svg markup carrying the caller class', () => {
    component = mount(Icon, {
      target,
      props: { src: XMark, class: 'h-5 w-5' },
    })

    const svg = renderedSvg()
    expect(svg.getAttribute('class')).toBe('h-5 w-5')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('renders the mini theme on its 20px grid', () => {
    component = mount(Icon, {
      target,
      props: { src: CheckCircle, theme: 'mini', class: 'h-3 w-3' },
    })

    const svg = renderedSvg()
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 20')
    expect(svg.getAttribute('fill')).toBe('currentColor')
  })

  it('SpinnerIcon keeps its spin classes and merges the caller colors', () => {
    component = mount(SpinnerIcon, {
      target,
      props: { class: 'h-10 w-10 fill-gray-700 text-gray-200' },
    })

    const classes = renderedSvg().getAttribute('class')!.split(' ')
    expect(classes).toEqual(
      expect.arrayContaining([
        'animate-spin',
        'fill-gray-700',
        'text-gray-200',
      ]),
    )
    expect(classes).not.toContain('text-white')
  })

  it('CircleIcon matches the outline set and forwards attributes', () => {
    component = mount(CircleIcon, {
      target,
      props: { class: 'h-4 w-4' },
    })

    const svg = renderedSvg()
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('stroke-width')).toBe('1.5')
    expect(svg.getAttribute('class')).toBe('h-4 w-4')
    expect(svg.querySelector('circle')).not.toBeNull()
  })
})
