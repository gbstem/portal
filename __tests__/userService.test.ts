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
  role: 'instructor' as const,
}

describe('userService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createUser', () => {
    beforeEach(() => {
      ;(auth.createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: newUser,
      })
      ;(auth.updateProfile as jest.Mock).mockResolvedValue(undefined)
      ;(firestore.setDoc as jest.Mock).mockResolvedValue(undefined)
    })

    it('creates the auth user, sets the display name, and writes the profile', async () => {
      const user = await userService.createUser(signUpValues)

      expect(user).toBe(newUser)
      const [, email, password] = (
        auth.createUserWithEmailAndPassword as jest.Mock
      ).mock.calls[0]
      expect([email, password]).toEqual(['timmy@example.com', 'hunter2'])
      expect(auth.updateProfile).toHaveBeenCalledWith(newUser, {
        displayName: 'Timmy Turner',
      })
      expectDocPaths(['users', 'uid-1'])
    })

    it('writes only role and name to the profile - no second identifier', async () => {
      await userService.createUser(signUpValues)

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      const [, payload] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload).toEqual({
        role: 'instructor',
        firstName: 'Timmy',
        lastName: 'Turner',
      })
    })

    it('propagates auth failures without writing a profile document', async () => {
      ;(auth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(
        new Error('auth/email-already-in-use'),
      )

      await expect(userService.createUser(signUpValues)).rejects.toThrow(
        'auth/email-already-in-use',
      )
      expect(firestore.setDoc).not.toHaveBeenCalled()
    })

    it('propagates setDoc failures so the caller can roll back', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(userService.createUser(signUpValues)).rejects.toThrow(
        'permission-denied',
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

  describe('deleteApplicationRecords', () => {
    it('deletes the application and decision documents', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValue(undefined)

      await userService.deleteApplicationRecords('uid-1')

      expect(firestore.deleteDoc).toHaveBeenCalledTimes(2)
    })

    it('never rejects even if both deletes fail', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockRejectedValue(
        new Error('permission-denied'),
      )

      await expect(
        userService.deleteApplicationRecords('uid-1'),
      ).resolves.toBeUndefined()
    })
  })

  describe('deleteAccountRecords', () => {
    it('deletes only the users document', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValue(undefined)

      await userService.deleteAccountRecords('uid-1')

      expect(firestore.deleteDoc).toHaveBeenCalledTimes(1)
      expectDocPaths(['users', 'uid-1'])
    })

    it('propagates errors rather than swallowing them', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(userService.deleteAccountRecords('uid-1')).rejects.toThrow(
        'permission-denied',
      )
    })
  })
})
