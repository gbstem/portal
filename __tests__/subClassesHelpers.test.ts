import type {} from '../src/data.d.ts'
import { filterCheckedOffSubClasses } from '$lib/helpers/subClasses'

describe('SubClasses Helpers', () => {
  describe('filterCheckedOffSubClasses', () => {
    test('filters out nulls and extracts sub request objects', () => {
      const mockReq = { id: 'req-1', course: 'Math' } as Data.SubRequest
      const checkedOff = [null, [mockReq], null]

      const filtered = filterCheckedOffSubClasses(checkedOff)
      expect(filtered).toEqual([mockReq])
    })
  })
})
