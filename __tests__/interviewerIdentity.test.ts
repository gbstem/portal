const mockGetUser = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminAuth: {
    getUser: (...args: any[]) => mockGetUser(...args),
  },
}))

import { resolveCurrentInterviewerEmail } from '$lib/server/interviewerIdentity'

describe('resolveCurrentInterviewerEmail', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // The scenario this function exists for: the interviewer changed their
  // account's email after the slot was created, so the stored email is
  // stale, but Firebase Auth (looked up by the stable uid) has the current one.
  test('returns the live Firebase Auth email', async () => {
    mockGetUser.mockResolvedValue({ email: 'new@example.com' })

    const email = await resolveCurrentInterviewerEmail('uid-owner', '/api/test')
    expect(email).toBe('new@example.com')
    expect(mockGetUser).toHaveBeenCalledWith('uid-owner')
  })

  test('returns undefined without an Auth lookup when the slot has no uid', async () => {
    const email = await resolveCurrentInterviewerEmail(undefined, '/api/test')
    expect(email).toBeUndefined()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  test('returns undefined if the Auth lookup fails', async () => {
    mockGetUser.mockRejectedValue(new Error('user-not-found'))

    const email = await resolveCurrentInterviewerEmail(
      'uid-deleted',
      '/api/test',
    )
    expect(email).toBeUndefined()
  })

  test('returns undefined if the Auth record has no email', async () => {
    mockGetUser.mockResolvedValue({ email: undefined })

    const email = await resolveCurrentInterviewerEmail('uid-owner', '/api/test')
    expect(email).toBeUndefined()
  })
})
