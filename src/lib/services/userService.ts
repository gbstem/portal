import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  decisionsCollection,
} from '$lib/data/collections'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { customAlphabet } from 'nanoid'

function generateId(): string {
  const alphabet = '0123456789'
  const nanoid = customAlphabet(alphabet, 7)
  return nanoid()
}

/**
 * Service providing Data Access Layer for user account records.
 */
export const userService = {
  /**
   * Generates a short numeric ID and confirms it's not already taken,
   * retrying up to 5 times. Returns an empty string if a unique ID couldn't
   * be confirmed (either exhausted retries or a lookup error).
   */
  async generateUniqueId(): Promise<string> {
    let id = generateId()
    for (let i = 0; i < 5; ++i) {
      try {
        const res = await getDoc(doc(db, 'ids', id))
        if (res.exists()) {
          id = generateId()
          if (i === 4) {
            id = ''
          }
        } else {
          break
        }
      } catch (err) {
        console.error('[userService] Error checking ID uniqueness:', err)
        id = ''
      }
    }
    return id
  },

  /**
   * Creates the `ids` reservation and `users` profile documents for a newly
   * signed-up account.
   */
  async createUserRecord(
    uid: string,
    id: string,
    role: 'instructor' | 'student',
    firstName: string,
    lastName: string,
  ): Promise<void> {
    await setDoc(doc(db, 'ids', id), {})
    await setDoc(doc(db, 'users', uid), { id, role, firstName, lastName })
  },

  /**
   * Updates a user's display name fields.
   */
  async updateUserName(
    uid: string,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { firstName, lastName })
  },

  /**
   * Deletes a user's application/decision documents. Individual failures are
   * swallowed (not thrown) since account deletion should proceed regardless.
   */
  async deleteApplicationRecords(uid: string): Promise<void> {
    await Promise.all(
      [
        deleteDoc(doc(db, applicationsCollection, uid)),
        deleteDoc(doc(db, decisionsCollection, uid)),
      ].map((p) => p.catch((e) => e)),
    )
  },

  /**
   * Deletes a user's `ids` reservation and `users` profile documents.
   * Failures here propagate, since these are the account records proper.
   */
  async deleteAccountRecords(uid: string, id: string): Promise<void> {
    await Promise.all([
      deleteDoc(doc(db, 'ids', id)),
      deleteDoc(doc(db, 'users', uid)),
    ])
  },
}
