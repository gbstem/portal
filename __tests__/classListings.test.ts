const mockCollection = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
  },
}))

jest.mock(
  '@sveltejs/kit',
  () => ({
    error: (status: number, message: string) => {
      const err: any = new Error(message)
      err.status = status
      return err
    },
  }),
  { virtual: true },
)

import { classesCollection } from '$lib/data/collections'
import {
  fetchClassListings,
  fetchStudentClasses,
} from '$lib/server/classListings'

const PARENT = 'parent-uid'
const timestamp = (iso: string) => ({ toDate: () => new Date(iso) })

/** Class documents as Firestore stores them, by id. */
const CLASSES: Record<string, any> = {
  'teacher-uid-1': {
    course: 'Python 1',
    classCap: 5,
    students: [`${PARENT}-1`, 'other-parent-1'],
    instructorUid: 'teacher-uid',
    instructorFirstName: 'Ada',
    instructorLastName: 'Lovelace',
    instructorEmail: 'ada@gbstem.org',
    meetingLink: 'https://teams.example/python',
    meetingTimes: [timestamp('2026-10-10T19:00:00.000Z')],
    classStatuses: ['ClassInFuture'],
    feedbackCompleted: [false],
    otherInstructorUids: ['cohost-uid'],
    classDay1: 'Saturday',
    classTime1: '15:00',
    gradeRecommendation: '3-5',
    online: true,
  },
  'teacher-uid-2': {
    course: 'Scratch',
    classCap: 3,
    students: ['other-parent-1'],
    instructorUid: 'teacher-uid',
    instructorFirstName: 'Ada',
    instructorLastName: 'Lovelace',
    meetingLink: 'https://teams.example/scratch',
    meetingTimes: [],
    online: true,
  },
}

function snapshot(ids: string[]) {
  return {
    docs: ids.map((id) => ({ id, data: () => CLASSES[id] })),
  }
}

describe('fetchClassListings', () => {
  let get: jest.Mock

  beforeEach(() => {
    get = jest.fn(async () => snapshot(Object.keys(CLASSES)))
    mockCollection.mockReset().mockReturnValue({ get })
  })

  it('lists every class this semester with the listing fields only', async () => {
    const classes = await fetchClassListings({ uid: PARENT, role: 'student' })

    expect(mockCollection).toHaveBeenCalledWith(classesCollection)
    expect(classes.map((c) => c.id)).toEqual(['teacher-uid-1', 'teacher-uid-2'])
    for (const listing of classes) {
      for (const field of [
        'students',
        'instructorEmail',
        'meetingTimes',
        'classStatuses',
        'feedbackCompleted',
        'otherInstructorUids',
      ]) {
        expect(listing).not.toHaveProperty(field)
      }
    }
    expect(classes[0]).toMatchObject({
      course: 'Python 1',
      instructorFirstName: 'Ada',
      instructorLastName: 'Lovelace',
      spotsRemaining: 3,
      gradeRecommendation: '3-5',
      online: true,
      classDays: ['Saturday'],
      classTimes: ['15:00'],
    })
  })

  it('gives a parent the meeting link only for a class their own student is on', async () => {
    const classes = await fetchClassListings({ uid: PARENT, role: 'student' })
    const byId = Object.fromEntries(classes.map((c) => [c.id, c]))

    expect(byId['teacher-uid-1'].meetingLink).toBe(
      'https://teams.example/python',
    )
    expect(byId['teacher-uid-2'].meetingLink).toBe('')
  })

  it('gives a parent whose uid only prefixes a rostered id no link', async () => {
    // `parent-uid-1` belongs to `parent-uid`, not to `parent`.
    const classes = await fetchClassListings({ uid: 'parent', role: 'student' })
    expect(classes.every((c) => c.meetingLink === '')).toBe(true)
  })

  it('gives an instructor no meeting links in the listing', async () => {
    // Their own classes' links come from /api/classDetails.
    const classes = await fetchClassListings({
      uid: 'teacher-uid',
      role: 'instructor',
    })
    expect(classes.every((c) => c.meetingLink === '')).toBe(true)
  })
})

describe('fetchStudentClasses', () => {
  let where: jest.Mock

  beforeEach(() => {
    where = jest.fn(() => ({
      get: async () => snapshot(['teacher-uid-1']),
    }))
    mockCollection.mockReset().mockReturnValue({ where })
  })

  it("returns the classes on whose roster the parent's student is", async () => {
    const classes = await fetchStudentClasses(PARENT, `${PARENT}-1`)

    expect(where).toHaveBeenCalledWith(
      'students',
      'array-contains',
      `${PARENT}-1`,
    )
    expect(classes).toEqual([
      {
        id: 'teacher-uid-1',
        course: 'Python 1',
        instructorFirstName: 'Ada',
        instructorLastName: 'Lovelace',
        meetingTimes: ['2026-10-10T19:00:00.000Z'],
        meetingLink: 'https://teams.example/python',
      },
    ])
  })

  it("refuses another family's student without reading anything", async () => {
    await expect(
      fetchStudentClasses(PARENT, 'other-parent-1'),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockCollection).not.toHaveBeenCalled()
  })
})
