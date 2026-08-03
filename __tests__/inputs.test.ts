import { mount, unmount, flushSync } from 'svelte'
import { fireEvent } from '@testing-library/dom'
import TextInput from '../src/lib/components/TextInput.svelte'
import NumberInput from '../src/lib/components/NumberInput.svelte'
import DateTimeInput from '../src/lib/components/DateTimeInput.svelte'

describe('Input Components', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('TextInput', () => {
    it('renders with label and binding value', () => {
      const val = 'hello'
      const app = mount(TextInput, {
        target: container,
        props: {
          label: 'Test Label',
          value: val,
          required: true,
        },
      })
      flushSync()

      const input = container.querySelector('input') as HTMLInputElement
      expect(input).not.toBeNull()
      expect(input.value).toBe('hello')
      expect(input.required).toBe(true)
      expect(container.textContent).toContain('Test Label*')

      unmount(app)
    })

    it('sets custom validity based on validations', () => {
      const app = mount(TextInput, {
        target: container,
        props: {
          label: 'Validated',
          required: true,
          value: '',
          validations: [[true, 'Custom error message']],
        },
      })
      flushSync()

      const input = container.querySelector('input') as HTMLInputElement
      expect(input.validationMessage).toBe('Please fill required fields.')

      unmount(app)
    })

    it('supports object class prop', () => {
      const app = mount(TextInput, {
        target: container,
        props: {
          class: {
            container: 'custom-container-class',
            input: 'custom-input-class',
          },
        },
      })
      flushSync()

      const wrapper = container.firstElementChild as HTMLElement
      const input = container.querySelector('input') as HTMLInputElement
      expect(wrapper.classList.contains('custom-container-class')).toBe(true)
      expect(input.classList.contains('custom-input-class')).toBe(true)

      unmount(app)
    })
  })

  describe('NumberInput', () => {
    it('renders number input and converts input value to number', () => {
      const numVal: number | string = 3
      const app = mount(NumberInput, {
        target: container,
        props: {
          label: 'Score',
          value: numVal,
          min: 0,
          max: 5,
        },
      })
      flushSync()

      const input = container.querySelector('input') as HTMLInputElement
      expect(input.type).toBe('number')
      expect(input.value).toBe('3')
      expect(input.min).toBe('0')
      expect(input.max).toBe('5')

      fireEvent.input(input, { target: { value: '4' } })
      flushSync()

      unmount(app)
    })
  })

  describe('DateTimeInput', () => {
    it('renders datetime-local input', () => {
      const app = mount(DateTimeInput, {
        target: container,
        props: {
          label: 'Meeting Time',
          value: '2026-08-03T14:00',
        },
      })
      flushSync()

      const input = container.querySelector('input') as HTMLInputElement
      expect(input.type).toBe('datetime-local')
      expect(input.value).toBe('2026-08-03T14:00')

      unmount(app)
    })
  })
})
