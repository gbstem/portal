import {
  planInstructorAccountDeletion,
  planStudentAccountDeletion,
} from '$lib/helpers/accountDeletion'

describe('planInstructorAccountDeletion', () => {
  it('allows deletion when the instructor owns no class and has no future sub request', () => {
    expect(planInstructorAccountDeletion(false, false, false)).toEqual({
      canDelete: true,
      reason: null,
    })
  })

  it('blocks deletion for the primary instructor of a class', () => {
    const result = planInstructorAccountDeletion(true, false, false)
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/instructor of one or more classes/i)
  })

  it('blocks deletion for a co-instructor of a class', () => {
    const result = planInstructorAccountDeletion(false, true, false)
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/instructor of one or more classes/i)
  })

  it('blocks deletion for a future substitute commitment', () => {
    const result = planInstructorAccountDeletion(false, false, true)
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/volunteered to substitute/i)
  })

  it('reports the class-ownership reason when both apply', () => {
    const result = planInstructorAccountDeletion(true, false, true)
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/instructor of one or more classes/i)
  })
})

describe('planStudentAccountDeletion', () => {
  it('allows deletion with no registrations at all', () => {
    expect(planStudentAccountDeletion([])).toEqual({
      canDelete: true,
      reason: null,
    })
  })

  it('allows deletion when every child is unenrolled', () => {
    const result = planStudentAccountDeletion([
      { id: 'uid-1', enrolled: false, classes: [] },
      { id: 'uid-1-2' },
    ])
    expect(result.canDelete).toBe(true)
  })

  it('blocks deletion when one child among several is enrolled', () => {
    const result = planStudentAccountDeletion([
      { id: 'uid-1', enrolled: false, classes: [] },
      { id: 'uid-1-2', enrolled: true, classes: ['class-1'] },
    ])
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/enrolled in a class/i)
  })

  it('blocks deletion on a non-empty classes array even if enrolled is not explicitly true', () => {
    const result = planStudentAccountDeletion([
      { id: 'uid-1', classes: ['class-1'] },
    ])
    expect(result.canDelete).toBe(false)
  })
})
