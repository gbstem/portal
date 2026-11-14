// Declared before the imports: `.svelte.test.ts` files are compiled with no
// jest-hoist step, so a mock placed after them would register too late.
jest.mock('#lib/client/firebase.js', () => {
  const { writable } = require('svelte/store')
  return { user: writable(undefined), auth: {}, db: {}, storage: {} }
})
jest.mock(
  '$app/state',
  () => ({ page: { data: { user: { role: 'student' } } } }),
  { virtual: true },
)

import { flushSync, mount, unmount } from 'svelte'
import { fireEvent, within } from '@testing-library/dom'
import StudentSelect from '#lib/components/StudentSelect.svelte'
import { selectedStudentIdState } from '#lib/stores.svelte.js'

describe('StudentSelect', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  function render(preloadedStudents: { uid: string; name: string }[]) {
    // A rune-backed holder, as a parent's bind:selectedStudentUid would be.
    const bound = $state({ uid: '' })
    const component = mount(StudentSelect, {
      target: container,
      props: {
        preloadedStudents,
        get selectedStudentUid() {
          return bound.uid
        },
        set selectedStudentUid(uid: string) {
          bound.uid = uid
        },
      },
    })
    flushSync()
    return { component, bound }
  }

  it('shows a lone student by name and selects them', () => {
    const { component, bound } = render([{ uid: 'child-a', name: 'Sam Lee' }])

    expect(within(container).getByText('Sam Lee')).toBeTruthy()
    expect(within(container).queryByRole('combobox')).toBeNull()
    expect(bound.uid).toBe('child-a')
    expect(selectedStudentIdState.current).toBe('child-a')
    unmount(component)
  })

  // A parent can register two children under one name (or the same child
  // twice); each must stay its own choice rather than collide on the name.
  it('keeps two students who share a name apart', () => {
    const { component, bound } = render([
      { uid: 'child-a', name: 'Sam Lee' },
      { uid: 'child-b', name: 'Sam Lee' },
    ])

    const select = within(container).getByRole<HTMLSelectElement>('combobox')
    expect(within(select).getAllByRole('option')).toHaveLength(2)
    expect(bound.uid).toBe('child-a')

    fireEvent.change(select, { target: { value: 'child-b' } })
    flushSync()
    expect(bound.uid).toBe('child-b')
    expect(selectedStudentIdState.current).toBe('child-b')
    unmount(component)
  })
})
