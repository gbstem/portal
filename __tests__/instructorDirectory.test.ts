const mockGetUsers = jest.fn()
const mockGetUserByEmail = jest.fn()
const mockDoc = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminAuth: {
    getUsers: (...args: any[]) => mockGetUsers(...args),
    getUserByEmail: (...args: any[]) => mockGetUserByEmail(...args),
  },
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
  },
}))

import {
  isAcceptedInstructor,
  lookupAcceptedInstructorByEmail,
  resolveCoInstructorEmails,
  resolveCoInstructorIdentities,
} from '$lib/server/instructorDirectory'
import { decisionsCollection } from '$lib/data/collections'

/**
 * Stands in for the two document reads every identity lookup makes: the
 * `users` profile (names) and this semester's `decisions` document
 * (eligibility). Anything not listed reads as a missing document.
 */
function mockFirestore(docs: Record<string, any>) {
  mockDoc.mockImplementation((path: string) => ({
    get: async () => ({
      exists: path in docs,
      data: () => docs[path],
    }),
  }))
}

const instructorRecord = {
  uid: 'uid-ada',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  customClaims: { role: 'instructor' },
}

const acceptedAda = {
  [`users/uid-ada`]: { firstName: 'Ada', lastName: 'Lovelace' },
  [`${decisionsCollection}/uid-ada`]: { type: 'accepted' },
}

describe('instructorDirectory', () => {
  beforeEach(() => {
    mockGetUsers.mockReset()
    mockGetUserByEmail.mockReset()
    mockDoc.mockReset()
    mockFirestore({})
  })

  describe('isAcceptedInstructor', () => {
    test('is true only for an accepted decision', async () => {
      mockFirestore(acceptedAda)
      await expect(isAcceptedInstructor('uid-ada')).resolves.toBe(true)
    })

    test('is false when no decision has been recorded yet', async () => {
      await expect(isAcceptedInstructor('uid-ada')).resolves.toBe(false)
    })

    // A `substitute` covers individual sessions through the subRequests flow
    // and is never assigned to a class roster, so it must not open this door.
    test.each(['rejected', 'waitlisted', 'substitute', 'interview'])(
      'is false for a %s decision',
      async (type) => {
        mockFirestore({ [`${decisionsCollection}/uid-ada`]: { type } })
        await expect(isAcceptedInstructor('uid-ada')).resolves.toBe(false)
      },
    )

    test('is false, rather than throwing, when the read fails', async () => {
      mockDoc.mockImplementation(() => ({
        get: async () => {
          throw new Error('permission denied')
        },
      }))
      await expect(isAcceptedInstructor('uid-ada')).resolves.toBe(false)
    })
  })

  describe('lookupAcceptedInstructorByEmail', () => {
    test('resolves an accepted instructor to their identity', async () => {
      mockGetUserByEmail.mockResolvedValue(instructorRecord)
      mockFirestore(acceptedAda)

      await expect(
        lookupAcceptedInstructorByEmail('ada@example.com'),
      ).resolves.toEqual({
        uid: 'uid-ada',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        accepted: true,
      })
    })

    // The whole point of the change: an instructor-role account is not
    // enough, because the role claim is set at signup, long before any
    // interview. Only the decision document says they were accepted.
    test('rejects an instructor account with no accepted decision', async () => {
      mockGetUserByEmail.mockResolvedValue(instructorRecord)
      mockFirestore({
        [`${decisionsCollection}/uid-ada`]: { type: 'rejected' },
      })

      await expect(
        lookupAcceptedInstructorByEmail('ada@example.com'),
      ).resolves.toBeNull()
    })

    // Keeps a co-instructor box from doubling as a "does this address have an
    // account" probe against admin/reviewer/student accounts.
    test('rejects an account that exists but is not an instructor', async () => {
      mockGetUserByEmail.mockResolvedValue({
        ...instructorRecord,
        customClaims: { role: 'admin' },
      })
      mockFirestore(acceptedAda)

      await expect(
        lookupAcceptedInstructorByEmail('ada@example.com'),
      ).resolves.toBeNull()
    })

    test('rejects an address with no account, and a malformed one, alike', async () => {
      mockGetUserByEmail.mockRejectedValue(new Error('user not found'))
      await expect(
        lookupAcceptedInstructorByEmail('nobody@example.com'),
      ).resolves.toBeNull()
      await expect(
        lookupAcceptedInstructorByEmail('not-an-email'),
      ).resolves.toBeNull()
    })

    test('falls back to the Auth display name when no profile document exists', async () => {
      mockGetUserByEmail.mockResolvedValue(instructorRecord)
      mockFirestore({
        [`${decisionsCollection}/uid-ada`]: { type: 'accepted' },
      })

      const identity = await lookupAcceptedInstructorByEmail('ada@example.com')
      expect(identity).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' })
    })
  })

  describe('resolveCoInstructorIdentities', () => {
    test('returns identities in the order the uids were given', async () => {
      mockGetUsers.mockResolvedValue({
        users: [
          { ...instructorRecord, uid: 'uid-grace', email: 'grace@example.com' },
          instructorRecord,
        ],
        notFound: [],
      })
      mockFirestore(acceptedAda)

      const identities = await resolveCoInstructorIdentities([
        'uid-ada',
        'uid-grace',
      ])
      expect(identities.map((one) => one.uid)).toEqual(['uid-ada', 'uid-grace'])
    })

    // Accounts get deleted; a class shouldn't carry a tombstone nobody can
    // act on, so the uid simply doesn't come back.
    test('drops a uid whose account no longer exists', async () => {
      mockGetUsers.mockResolvedValue({
        users: [instructorRecord],
        notFound: [{ uid: 'uid-deleted' }],
      })
      mockFirestore(acceptedAda)

      const identities = await resolveCoInstructorIdentities([
        'uid-ada',
        'uid-deleted',
      ])
      expect(identities.map((one) => one.uid)).toEqual(['uid-ada'])
    })

    // An account that still exists but lost its acceptance is reported, not
    // dropped - the class owner has to remove it deliberately.
    test('keeps an ineligible account, flagged as not accepted', async () => {
      mockGetUsers.mockResolvedValue({
        users: [instructorRecord],
        notFound: [],
      })
      mockFirestore({
        [`users/uid-ada`]: { firstName: 'Ada', lastName: 'Lovelace' },
        [`${decisionsCollection}/uid-ada`]: { type: 'rejected' },
      })

      const [identity] = await resolveCoInstructorIdentities(['uid-ada'])
      expect(identity).toMatchObject({ uid: 'uid-ada', accepted: false })
    })

    test('deduplicates repeated uids before looking them up', async () => {
      mockGetUsers.mockResolvedValue({ users: [], notFound: [] })
      await resolveCoInstructorIdentities(['uid-ada', 'uid-ada'])
      expect(mockGetUsers).toHaveBeenCalledWith([{ uid: 'uid-ada' }])
    })

    test('does not call Auth at all for an empty list', async () => {
      await expect(resolveCoInstructorIdentities([])).resolves.toEqual([])
      expect(mockGetUsers).not.toHaveBeenCalled()
    })

    // getUsers rejects more than 100 identifiers per call.
    test('chunks more than 100 uids across several calls', async () => {
      mockGetUsers.mockResolvedValue({ users: [], notFound: [] })
      const uids = Array.from({ length: 150 }, (_, i) => `uid-${i}`)

      await resolveCoInstructorIdentities(uids)
      expect(mockGetUsers).toHaveBeenCalledTimes(2)
      expect(mockGetUsers.mock.calls[0][0]).toHaveLength(100)
      expect(mockGetUsers.mock.calls[1][0]).toHaveLength(50)
    })
  })

  describe('resolveCoInstructorEmails', () => {
    // The addresses on the account *now*, not whatever was frozen into the
    // class document when the co-instructor was added.
    test('returns current addresses and drops deleted accounts', async () => {
      mockGetUsers.mockResolvedValue({
        users: [{ ...instructorRecord, email: 'ada.new@example.com' }],
        notFound: [{ uid: 'uid-deleted' }],
      })
      mockFirestore(acceptedAda)

      await expect(
        resolveCoInstructorEmails(['uid-ada', 'uid-deleted']),
      ).resolves.toEqual(['ada.new@example.com'])
    })

    test('is empty for an empty uid list', async () => {
      await expect(resolveCoInstructorEmails([])).resolves.toEqual([])
    })
  })
})
