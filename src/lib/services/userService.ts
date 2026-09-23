import { auth, db } from '$lib/client/firebase'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  updateProfile,
  type User,
} from 'firebase/auth'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'

export interface AccountDeletionEligibility {
  canDelete: boolean
  reason: string | null
}

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
   * Creates the Auth account and its display name. Throws on any failure —
   * callers are responsible for calling `rollbackNewUser` from their error
   * handler, since a failure further downstream (the profile write, the
   * session sync) should tear the account down too.
   *
   * Deliberately does *not* write `users/{uid}`. `/api/signup` writes that
   * document and sets the role claim with the Admin SDK, because a role chosen
   * in the browser is a role an attacker chooses, and the two are created
   * together. The account therefore exists for a moment with no profile,
   * which is why the caller must treat a failed `/api/signup` as fatal and
   * roll back.
   */
  async createUser(profile: {
    email: string
    password: string
    firstName: string
    lastName: string
  }): Promise<User> {
    const { firstName, lastName } = profile
    const { user } = await createUserWithEmailAndPassword(
      auth,
      profile.email,
      profile.password,
    )
    await updateProfile(user, { displayName: `${firstName} ${lastName}` })
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
   * Whether the signed-in account could delete itself right now - the
   * pre-flight check `DeleteAccountForm` runs on the first "Delete account"
   * click, before showing either the blocked-reason dialog or the password
   * confirmation.
   */
  async checkAccountDeletionEligibility(): Promise<AccountDeletionEligibility> {
    const res = await fetch('/api/account')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(body.message ?? 'Failed to check account status.')
    }
    return body
  },

  /**
   * Deletes the signed-in account's server-side data (and, once that
   * succeeds, its Auth account) - see portal's `/api/account` DELETE and
   * `deleteAccount`. Throws with the server's message on refusal (e.g. an
   * owned class or an enrolled child) or failure.
   */
  async deleteAccountViaApi(): Promise<void> {
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? 'Failed to delete account.')
    }
  },
}
