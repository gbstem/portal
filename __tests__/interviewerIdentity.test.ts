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
  })

  test('falls back to the stored email when no uid is on file', async () => {
    const email = await resolveCurrentInterviewerEmail(
      undefined,
      'stored@example.com',
    )
    expect(email).toBe('stored@example.com')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  // The scenario this function exists for: the interviewer changed their
  // account's email after the slot was created, so the stored email is
  // stale, but Firebase Auth (looked up by the stable uid) has the current one.
  test('prefers the live Firebase Auth email over a stale stored email', async () => {
    mockGetUser.mockResolvedValue({ email: 'new@example.com' })

    const email = await resolveCurrentInterviewerEmail(
      'uid-owner',
      'old@example.com',
    )
    expect(email).toBe('new@example.com')
    expect(mockGetUser).toHaveBeenCalledWith('uid-owner')
  })

  test('falls back to the stored email if the Auth lookup fails', async () => {
    mockGetUser.mockRejectedValue(new Error('user-not-found'))

    const email = await resolveCurrentInterviewerEmail(
      'uid-deleted',
      'stored@example.com',
    )
    expect(email).toBe('stored@example.com')
  })

  test('falls back to the stored email if the Auth record has no email', async () => {
    mockGetUser.mockResolvedValue({ email: undefined })

    const email = await resolveCurrentInterviewerEmail(
      'uid-owner',
      'stored@example.com',
    )
    expect(email).toBe('stored@example.com')
  })
})
