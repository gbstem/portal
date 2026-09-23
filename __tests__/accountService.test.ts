const mockRunTransaction = jest.fn()
const mockDeleteUser = jest.fn()

/** Every document the fake Firestore holds, by full path (`collection/id`). */
let docs: Record<string, any>

function docSnapshot(path: string) {
  const id = path.split('/').pop() as string
  return {
    exists: path in docs,
    data: () => docs[path],
    id,
    ref: { path },
  }
}

function docsInCollection(collection: string) {
  const prefix = `${collection}/`
  return Object.entries(docs)
    .filter(
      ([path]) =>
        path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
    )
    .map(([path]) => docSnapshot(path))
}

function matchesFilter(
  data: any,
  [field, op, value]: [string, string, unknown],
): boolean {
  if (op === '==') return data[field] === value
  if (op === 'array-contains') {
    return Array.isArray(data[field]) && data[field].includes(value)
  }
  throw new Error(`unsupported operator ${op}`)
}

function makeQuery(
  collection: string,
  filters: Array<[string, string, unknown]>,
  limitN?: number,
) {
  const run = () => {
    let results = docsInCollection(collection).filter((snap) =>
      filters.every((f) => matchesFilter(snap.data(), f)),
    )
    if (limitN !== undefined) results = results.slice(0, limitN)
    return results
  }
  return {
    __query: true as const,
    where: (field: string, op: string, value: unknown) =>
      makeQuery(collection, [...filters, [field, op, value]], limitN),
    limit: (n: number) => makeQuery(collection, filters, n),
    get: async () => ({ empty: run().length === 0, docs: run() }),
  }
}

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (path: string) => ({ path, get: async () => docSnapshot(path) }),
    collection: (name: string) => makeQuery(name, []),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
  adminAuth: {
    deleteUser: (...args: any[]) => mockDeleteUser(...args),
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

import {
  applicationsCollection,
  classesCollection,
  decisionsCollection,
  registrationsCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import {
  checkAccountDeletionEligibility,
  deleteAccount,
} from '$lib/server/accountService'
import type {} from '../src/data.d.ts'

const DAY = 24 * 60 * 60 * 1000
const timestamp = (date: Date) => ({ toDate: () => date })
const future = new Date(Date.now() + DAY)
const past = new Date(Date.now() - DAY)

let transaction: {
  get: jest.Mock
  getAll: jest.Mock
  delete: jest.Mock
}

/**
 * The paths `transaction.delete` was called with. `adminDb.doc()`'s mock
 * refs also carry a `get` method (needed for the plain-read eligibility
 * check), so an exact-object match on the ref would be brittle - compare
 * paths instead.
 */
function deletedPaths(): string[] {
  return transaction.delete.mock.calls.map(([ref]) => ref.path)
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = {}
  // Mirrors real Firestore: a transaction refuses any read queued after a
  // write, so a get()/getAll() call issued too late throws here exactly
  // like it would against the emulator - this is what caught
  // deleteAccount's student branch reading `confirmations` after already
  // queuing the registration deletes.
  let wrote = false
  transaction = {
    get: jest.fn(async (refOrQuery: any) => {
      if (wrote) {
        throw new Error(
          'Firestore transactions require all reads to be executed before all writes.',
        )
      }
      return refOrQuery.__query
        ? refOrQuery.get()
        : docSnapshot(refOrQuery.path)
    }),
    getAll: jest.fn(async (...refs: any[]) => {
      if (wrote) {
        throw new Error(
          'Firestore transactions require all reads to be executed before all writes.',
        )
      }
      return refs.map((ref) => docSnapshot(ref.path))
    }),
    delete: jest.fn(() => {
      wrote = true
    }),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
})

const UID = 'instructor-uid'

describe('checkAccountDeletionEligibility (instructor)', () => {
  it('is eligible with no classes and no sub requests', async () => {
    await expect(
      checkAccountDeletionEligibility(UID, 'instructor'),
    ).resolves.toEqual({ canDelete: true, reason: null })
  })

  it('is blocked when the instructor owns a class', async () => {
    docs[`${classesCollection}/class-1`] = {
      instructorUid: UID,
      otherInstructorUids: [],
    }
    const result = await checkAccountDeletionEligibility(UID, 'instructor')
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/instructor of one or more classes/i)
  })

  it('is blocked when the instructor co-instructs a class', async () => {
    docs[`${classesCollection}/class-1`] = {
      instructorUid: 'someone-else',
      otherInstructorUids: [UID],
    }
    const result = await checkAccountDeletionEligibility(UID, 'instructor')
    expect(result.canDelete).toBe(false)
  })

  it('is blocked by a future substitute commitment', async () => {
    docs[`${substituteRequestsCollection}/sub-1`] = {
      subInstructorId: UID,
      dateOfClass: timestamp(future),
    }
    const result = await checkAccountDeletionEligibility(UID, 'instructor')
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/volunteered to substitute/i)
  })

  it('is eligible with only a past substitute commitment', async () => {
    docs[`${substituteRequestsCollection}/sub-1`] = {
      subInstructorId: UID,
      dateOfClass: timestamp(past),
    }
    await expect(
      checkAccountDeletionEligibility(UID, 'instructor'),
    ).resolves.toEqual({ canDelete: true, reason: null })
  })

  it("ignores another instructor's classes and sub requests", async () => {
    docs[`${classesCollection}/class-1`] = {
      instructorUid: 'someone-else',
      otherInstructorUids: [],
    }
    docs[`${substituteRequestsCollection}/sub-1`] = {
      subInstructorId: 'someone-else',
      dateOfClass: timestamp(future),
    }
    await expect(
      checkAccountDeletionEligibility(UID, 'instructor'),
    ).resolves.toEqual({ canDelete: true, reason: null })
  })
})

describe('deleteAccount (instructor)', () => {
  it('deletes the application, decision, instructorClasses and users documents, then the Auth account', async () => {
    docs[`${applicationsCollection}/${UID}`] = { meta: { uid: UID } }
    docs[`${decisionsCollection}/${UID}`] = { type: 'accepted' }
    docs[`instructorClasses/${UID}`] = { classIds: [] }

    await deleteAccount(UID, 'instructor')

    expect(deletedPaths().sort()).toEqual(
      [
        `${applicationsCollection}/${UID}`,
        `${decisionsCollection}/${UID}`,
        `instructorClasses/${UID}`,
        `users/${UID}`,
      ].sort(),
    )
    expect(mockDeleteUser).toHaveBeenCalledWith(UID)
  })

  it('skips deleting application/decision/instructorClasses documents that never existed', async () => {
    await deleteAccount(UID, 'instructor')

    expect(deletedPaths()).toEqual([`users/${UID}`])
  })

  it('refuses to delete (409) when the instructor still owns a class, and deletes nothing', async () => {
    docs[`${classesCollection}/class-1`] = {
      instructorUid: UID,
      otherInstructorUids: [],
    }

    await expect(deleteAccount(UID, 'instructor')).rejects.toMatchObject({
      status: 409,
    })
    expect(transaction.delete).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('does not delete the Auth account when the transaction fails', async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error('unavailable'))

    await expect(deleteAccount(UID, 'instructor')).rejects.toThrow(
      'unavailable',
    )
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })
})

const PARENT_UID = 'parent-uid'

describe('checkAccountDeletionEligibility (student)', () => {
  it('is eligible with no registrations at all', async () => {
    await expect(
      checkAccountDeletionEligibility(PARENT_UID, 'student'),
    ).resolves.toEqual({ canDelete: true, reason: null })
  })

  it('is eligible when every existing child is unenrolled', async () => {
    docs[`${registrationsCollection}/${PARENT_UID}-1`] = {
      enrolled: false,
      classes: [],
    }
    await expect(
      checkAccountDeletionEligibility(PARENT_UID, 'student'),
    ).resolves.toEqual({ canDelete: true, reason: null })
  })

  it('is blocked when a child is enrolled', async () => {
    docs[`${registrationsCollection}/${PARENT_UID}-1`] = {
      enrolled: false,
      classes: [],
    }
    docs[`${registrationsCollection}/${PARENT_UID}-2`] = {
      enrolled: true,
      classes: ['class-1'],
    }
    const result = await checkAccountDeletionEligibility(PARENT_UID, 'student')
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/enrolled in a class/i)
  })
})

describe('deleteAccount (student)', () => {
  it('deletes every existing registration, confirmations, and the users document, then the Auth account', async () => {
    docs[`${registrationsCollection}/${PARENT_UID}-1`] = {
      enrolled: false,
      classes: [],
    }
    docs[`${registrationsCollection}/${PARENT_UID}-2`] = {
      enrolled: false,
      classes: [],
    }
    docs[`confirmations/${PARENT_UID}`] = { confirmed: true }

    await deleteAccount(PARENT_UID, 'student')

    expect(deletedPaths().sort()).toEqual(
      [
        `${registrationsCollection}/${PARENT_UID}-1`,
        `${registrationsCollection}/${PARENT_UID}-2`,
        `confirmations/${PARENT_UID}`,
        `users/${PARENT_UID}`,
      ].sort(),
    )
    expect(mockDeleteUser).toHaveBeenCalledWith(PARENT_UID)
  })

  it('skips a confirmations document that never existed', async () => {
    await deleteAccount(PARENT_UID, 'student')

    expect(deletedPaths()).toEqual([`users/${PARENT_UID}`])
  })

  it('refuses to delete (409) when a child is enrolled, and deletes nothing', async () => {
    docs[`${registrationsCollection}/${PARENT_UID}-1`] = {
      enrolled: true,
      classes: ['class-1'],
    }

    await expect(deleteAccount(PARENT_UID, 'student')).rejects.toMatchObject({
      status: 409,
    })
    expect(transaction.delete).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })
})
