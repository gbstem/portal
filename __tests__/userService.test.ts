import { userService } from '$lib/services/userService'
import * as auth from 'firebase/auth'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
}))

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  deleteUser: jest.fn(),
  updateProfile: jest.fn(),
}))

const newUser = { uid: 'uid-1' } as any

// `$lib/client/firebase`'s `db`/`auth` handles are undefined under the mocked
// SDK, so assert on the path segments rather than the handle itself.
function expectDocPaths(...paths: Array<[string, string]>) {
  expect(
    (firestore.doc as jest.Mock).mock.calls.map(([, ...rest]) => rest),
  ).toEqual(paths)
}

const signUpValues = {
  email: 'timmy@example.com',
  password: 'hunter2',
  firstName: 'Timmy',
  lastName: 'Turner',
}

describe('userService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('createUser', () => {
    beforeEach(() => {
      ;(auth.createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: newUser,
      })
      ;(auth.updateProfile as jest.Mock).mockResolvedValue(undefined)
      ;(firestore.setDoc as jest.Mock).mockResolvedValue(undefined)
    })

    it('creates the auth user and sets the display name', async () => {
      const user = await userService.createUser(signUpValues)

      expect(user).toBe(newUser)
      const [, email, password] = (
        auth.createUserWithEmailAndPassword as jest.Mock
      ).mock.calls[0]
      expect([email, password]).toEqual(['timmy@example.com', 'hunter2'])
      expect(auth.updateProfile).toHaveBeenCalledWith(newUser, {
        displayName: 'Timmy Turner',
      })
    })

    it('writes no profile document, because /api/signup writes it with the role claim', async () => {
      // The role is authorization, and a role chosen in the browser is a role
      // an attacker picks. /api/signup writes users/{uid} and sets the custom
      // claim with the Admin SDK.
      await userService.createUser(signUpValues)

      expect(firestore.setDoc).not.toHaveBeenCalled()
    })

    it('propagates auth failures without writing anything', async () => {
      ;(auth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        new Error('auth/email-already-in-use'),
      )

      await expect(userService.createUser(signUpValues)).rejects.toThrow(
        'auth/email-already-in-use',
      )
      expect(firestore.setDoc).not.toHaveBeenCalled()
    })

    it('propagates display-name failures so the caller can roll back', async () => {
      ;(auth.updateProfile as jest.Mock).mockRejectedValueOnce(
        new Error('auth/network-request-failed'),
      )

      await expect(userService.createUser(signUpValues)).rejects.toThrow(
        'auth/network-request-failed',
      )
    })
  })

  describe('rollbackNewUser', () => {
    it('deletes the profile document and then the auth user', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValue(undefined)
      ;(auth.deleteUser as jest.Mock).mockResolvedValue(undefined)

      await userService.rollbackNewUser(newUser)

      expectDocPaths(['users', 'uid-1'])
      expect(firestore.deleteDoc).toHaveBeenCalledTimes(1)
      expect(auth.deleteUser).toHaveBeenCalledWith(newUser)
    })

    it('still deletes the auth user when the profile delete fails', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      ;(firestore.deleteDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      ;(auth.deleteUser as jest.Mock).mockResolvedValue(undefined)

      await expect(
        userService.rollbackNewUser(newUser),
      ).resolves.toBeUndefined()

      expect(auth.deleteUser).toHaveBeenCalledWith(newUser)
      expect(errorSpy).toHaveBeenCalledWith(
        '[userService] Error rolling back user record:',
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })

    it('never rejects, so it cannot mask the error that triggered it', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      ;(firestore.deleteDoc as jest.Mock).mockRejectedValue(
        new Error('permission-denied'),
      )
      ;(auth.deleteUser as jest.Mock).mockRejectedValue(
        new Error('auth/requires-recent-login'),
      )

      await expect(
        userService.rollbackNewUser(newUser),
      ).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith(
        '[userService] Error rolling back auth user:',
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })
  })

  describe('updateUserName', () => {
    it('updates the firstName/lastName fields', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await userService.updateUserName('uid-1', 'Timmy', 'Turner')

      expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), {
        firstName: 'Timmy',
        lastName: 'Turner',
      })
    })

    it('propagates errors from updateDoc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        userService.updateUserName('uid-1', 'Timmy', 'Turner'),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('checkAccountDeletionEligibility', () => {
    it('returns the eligibility the API reports', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ canDelete: false, reason: 'Reason text' }),
      })

      await expect(
        userService.checkAccountDeletionEligibility(),
      ).resolves.toEqual({ canDelete: false, reason: 'Reason text' })
      expect(global.fetch).toHaveBeenCalledWith('/api/account')
    })

    it('throws the server message on a failed request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Not signed in.' }),
      })

      await expect(
        userService.checkAccountDeletionEligibility(),
      ).rejects.toThrow('Not signed in.')
    })
  })

  describe('deleteAccountViaApi', () => {
    it('calls DELETE on the account route', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await userService.deleteAccountViaApi()

      expect(global.fetch).toHaveBeenCalledWith('/api/account', {
        method: 'DELETE',
      })
    })

    it('throws the server message when deletion is refused', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'One or more of your children...' }),
      })

      await expect(userService.deleteAccountViaApi()).rejects.toThrow(
        'One or more of your children...',
      )
    })
  })
})
