import { userService } from '$lib/services/userService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
}))

// nanoid ships as pure ESM, which ts-jest can't transform out of
// node_modules by default - stub it with a deterministic-but-unique
// generator so retry-loop tests can distinguish successive ids.
let nanoidCallCount = 0
jest.mock('nanoid', () => ({
  customAlphabet: () => () => `${1000000 + nanoidCallCount++}`,
}))

describe('userService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateUniqueId', () => {
    it('returns the first generated id when it is not already taken', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const id = await userService.generateUniqueId()
      expect(id).toMatch(/^\d{7}$/)
      expect(firestore.getDoc).toHaveBeenCalledTimes(1)
    })

    it('retries generating a new id when the first is already taken', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({ exists: () => true })
        .mockResolvedValueOnce({ exists: () => false })

      const id = await userService.generateUniqueId()
      expect(id).toMatch(/^\d{7}$/)
      expect(firestore.getDoc).toHaveBeenCalledTimes(2)
    })

    it('gives up and returns an empty string after 5 taken attempts', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
      })

      const id = await userService.generateUniqueId()
      expect(id).toBe('')
      expect(firestore.getDoc).toHaveBeenCalledTimes(5)
    })

    it('sets id to empty string on a lookup error but keeps looping through remaining attempts', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockRejectedValueOnce(new Error('permission-denied'))
        .mockResolvedValueOnce({ exists: () => false })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const id = await userService.generateUniqueId()

      // The second attempt checks the now-empty id string, finds it doesn't
      // exist, and breaks out with id still '' - matching the original
      // SignUpForm loop's behavior (no early return from the catch branch).
      expect(id).toBe('')
      expect(firestore.getDoc).toHaveBeenCalledTimes(2)
      expect(errorSpy).toHaveBeenCalledWith(
        '[userService] Error checking ID uniqueness:',
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })
  })

  describe('createUserRecord', () => {
    it('creates the ids reservation and users profile documents', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValue(undefined)

      await userService.createUserRecord(
        'uid-1',
        '1234567',
        'instructor',
        'Timmy',
        'Turner',
      )

      expect(firestore.setDoc).toHaveBeenCalledTimes(2)
      const [, idPayload] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(idPayload).toEqual({})
      const [, userPayload] = (firestore.setDoc as jest.Mock).mock.calls[1]
      expect(userPayload).toEqual({
        id: '1234567',
        role: 'instructor',
        firstName: 'Timmy',
        lastName: 'Turner',
      })
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        userService.createUserRecord(
          'uid-1',
          '1234567',
          'student',
          'Timmy',
          'Turner',
        ),
      ).rejects.toThrow('permission-denied')
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
    it('deletes the ids and users documents', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValue(undefined)

      await userService.deleteAccountRecords('uid-1', '1234567')

      expect(firestore.deleteDoc).toHaveBeenCalledTimes(2)
    })

    it('propagates errors rather than swallowing them', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        userService.deleteAccountRecords('uid-1', '1234567'),
      ).rejects.toThrow('permission-denied')
    })
  })
})
