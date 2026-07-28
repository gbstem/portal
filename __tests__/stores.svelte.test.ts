import { dialogState, selectedStudentIdState } from '../src/lib/stores.svelte'

describe('stores.svelte', () => {
  beforeEach(() => {
    dialogState.current = null
    selectedStudentIdState.current = ''
  })

  describe('dialogState', () => {
    it('initializes to null', () => {
      expect(dialogState.current).toBeNull()
    })

    it('can be set and cleared', () => {
      dialogState.current = 'dialog-1'
      expect(dialogState.current).toBe('dialog-1')
      dialogState.current = null
      expect(dialogState.current).toBeNull()
    })
  })

  describe('selectedStudentIdState', () => {
    it('initializes to an empty string', () => {
      expect(selectedStudentIdState.current).toBe('')
    })

    it('can be set', () => {
      selectedStudentIdState.current = 'student-123'
      expect(selectedStudentIdState.current).toBe('student-123')
    })
  })
})
