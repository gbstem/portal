const mockFetchInstructorClasses = jest.fn()
const mockCollectionGroup = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    collectionGroup: (...args: any[]) => mockCollectionGroup(...args),
  },
}))

jest.mock('#lib/server/instructorClasses.js', () => ({
  fetchInstructorClasses: (...args: any[]) =>
    mockFetchInstructorClasses(...args),
}))

import { ClassStatus } from '#lib/components/helpers/ClassStatus.js'
import { SubRequestStatus } from '#lib/components/helpers/SubRequestStatus.js'
import { currentSemester } from '#lib/data/collections.js'
import {
  communityServiceSummary,
  semesterSeasonAndYear,
} from '#lib/server/communityService.js'

/** A fake collection-group query whose count() resolves to `count`. */
function subRequestsCounting(count: number) {
  const query: any = {
    where: jest.fn(() => query),
    count: () => ({ get: async () => ({ data: () => ({ count }) }) }),
  }
  mockCollectionGroup.mockReturnValue(query)
  return query
}

describe('semesterSeasonAndYear', () => {
  it('reads the season and four-digit year from a semester id', () => {
    expect(semesterSeasonAndYear('Fall26')).toEqual({
      season: 'fall',
      year: 2026,
    })
    expect(semesterSeasonAndYear('Spring27')).toEqual({
      season: 'spring',
      year: 2027,
    })
  })

  it('throws on an id it does not recognize', () => {
    expect(() => semesterSeasonAndYear('Summer26')).toThrow('Summer26')
  })

  it('understands the configured current semester', () => {
    expect(() => semesterSeasonAndYear(currentSemester)).not.toThrow()
  })
})

describe('communityServiceSummary', () => {
  beforeEach(() => {
    mockFetchInstructorClasses.mockReset()
    mockCollectionGroup.mockReset()
  })

  it('credits held sessions of the caller’s classes and their completed substitute sessions', async () => {
    mockFetchInstructorClasses.mockResolvedValue({
      'teacher-uid-1': {
        course: 'Python 1',
        classStatuses: [
          ClassStatus.EverythingComplete,
          ClassStatus.FeedbackIncomplete,
          ClassStatus.ClassNotHeld,
          ClassStatus.ClassInFuture,
        ],
      },
      'other-uid-1': {
        course: 'Scratch',
        classStatuses: [
          ClassStatus.EverythingComplete,
          ClassStatus.ClassUpcomingSoon,
        ],
      },
    })
    const query = subRequestsCounting(2)

    const summary = await communityServiceSummary('teacher-uid')

    expect(mockFetchInstructorClasses).toHaveBeenCalledWith('teacher-uid')
    expect(mockCollectionGroup).toHaveBeenCalledWith('subRequests')
    expect(query.where).toHaveBeenCalledWith(
      'subInstructorId',
      '==',
      'teacher-uid',
    )
    expect(query.where).toHaveBeenCalledWith(
      'subRequestStatus',
      '==',
      SubRequestStatus.NoSubstituteNeeded,
    )
    expect(summary).toEqual({
      classSessions: 3,
      subSessions: 2,
      classHours: 3.75,
      subHours: 3,
      totalHours: 6.75,
      course: 'Python 1, Scratch',
      ...semesterSeasonAndYear(currentSemester),
    })
  })

  it('names a course once when the caller teaches it in two classes', async () => {
    mockFetchInstructorClasses.mockResolvedValue({
      a: { course: 'Python 1', classStatuses: [] },
      b: { course: 'Python 1', classStatuses: [] },
    })
    subRequestsCounting(0)

    const summary = await communityServiceSummary('teacher-uid')

    expect(summary.course).toBe('Python 1')
  })

  it('is all zeroes for an instructor with no classes or substitute sessions', async () => {
    mockFetchInstructorClasses.mockResolvedValue({})
    subRequestsCounting(0)

    const summary = await communityServiceSummary('teacher-uid')

    expect(summary).toMatchObject({
      classSessions: 0,
      subSessions: 0,
      totalHours: 0,
      course: '',
    })
  })
})
