const mockGetUsers = jest.fn()
const mockGetUserByEmail = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminAuth: {
    getUsers: (...args: any[]) => mockGetUsers(...args),
    getUserByEmail: (...args: any[]) => mockGetUserByEmail(...args),
  },
}))

import { resolveInstructorUids } from '$lib/server/resolveInstructorUids'

describe('resolveInstructorUids', () => {
  beforeEach(() => {
    mockGetUsers.mockReset()
    mockGetUserByEmail.mockReset()
  })

  test('resolves emails belonging to instructor accounts', async () => {
    mockGetUsers.mockResolvedValue({
      users: [
        {
          email: 'instructor@example.com',
          uid: 'uid-instructor',
          customClaims: { role: 'instructor' },
        },
      ],
    })

    const result = await resolveInstructorUids(['instructor@example.com'])
    expect(result).toEqual({ 'instructor@example.com': 'uid-instructor' })
  })

  // The whole point of scoping this to instructors: a co-instructor field
  // shouldn't double as a general "does this email have an account" probe
  // against admin/reviewer/student accounts.
  test('omits accounts that exist but are not instructors', async () => {
    mockGetUsers.mockResolvedValue({
      users: [
        {
          email: 'admin@example.com',
          uid: 'uid-admin',
          customClaims: { role: 'admin' },
        },
      ],
    })

    const result = await resolveInstructorUids(['admin@example.com'])
    expect(result).toEqual({})
  })

  test('omits emails with no account at all', async () => {
    mockGetUsers.mockResolvedValue({ users: [] })

    const result = await resolveInstructorUids(['nobody@example.com'])
    expect(result).toEqual({})
  })

  // otherInstructorEmails is free text a class owner types by hand, so a
  // malformed entry reaching here is expected, not exceptional.
  test('falls back to per-email lookups when the batch call rejects on a malformed identifier', async () => {
    mockGetUsers.mockRejectedValueOnce(new Error('invalid email'))
    mockGetUserByEmail.mockImplementation((email: string) =>
      email === 'instructor@example.com'
        ? Promise.resolve({
            email,
            uid: 'uid-instructor',
            customClaims: { role: 'instructor' },
          })
        : Promise.reject(new Error('not found')),
    )

    const result = await resolveInstructorUids([
      'not-an-email',
      'instructor@example.com',
    ])
    expect(result).toEqual({ 'instructor@example.com': 'uid-instructor' })
  })

  test('deduplicates repeated emails before looking them up', async () => {
    mockGetUsers.mockResolvedValue({
      users: [
        {
          email: 'instructor@example.com',
          uid: 'uid-instructor',
          customClaims: { role: 'instructor' },
        },
      ],
    })

    await resolveInstructorUids([
      'instructor@example.com',
      'instructor@example.com',
    ])
    expect(mockGetUsers).toHaveBeenCalledWith([
      { email: 'instructor@example.com' },
    ])
  })
})
