import { auth, db } from '$lib/client/firebase'
import {
  applicationsCollection,
  decisionsCollection,
} from '$lib/data/collections'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  updateProfile,
  type User,
} from 'firebase/auth'
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore'

/**
 * Service providing Data Access Layer for user account records.
 *
 * A user's identity is their Firebase Auth `uid`; there is no second
 * identifier. `$lib/client/firebase`'s user store patches the `uid` into the
 * profile at read time, so callers never have to carry it alongside the
 * profile.
 */
export const userService = {
  /**
   * Creates an account end-to-end: the Auth user, its display name, and the
   * `users` profile document. Throws on any failure — callers are responsible
   * for calling `rollbackNewUser` from their error handler, since a failure
   * further downstream (session sync, say) should tear the account down too.
   */
  async createUser(profile: {
    email: string
    password: string
    firstName: string
    lastName: string
    role: 'instructor' | 'student'
  }): Promise<User> {
    const { firstName, lastName, role } = profile
    const { user } = await createUserWithEmailAndPassword(
      auth,
      profile.email,
      profile.password,
    )
    await updateProfile(user, { displayName: `${firstName} ${lastName}` })
    await setDoc(doc(db, 'users', user.uid), { role, firstName, lastName })
    return user
  },

  /**
   * Best-effort teardown of a half-created account. Never throws: it runs from
   * an error handler and must not mask the error that triggered it.
   */
  async rollbackNewUser(user: User): Promise<void> {
    try {
      await deleteDoc(doc(db, 'users', user.uid))
    } catch (err) {
      console.error('[userService] Error rolling back user record:', err)
    }
    try {
      await deleteUser(user)
    } catch (err) {
      console.error('[userService] Error rolling back auth user:', err)
    }
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
   * Deletes a user's `users` profile document. Failures here propagate, since
   * this is the account record proper.
   */
  async deleteAccountRecords(uid: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid))
  },
}
