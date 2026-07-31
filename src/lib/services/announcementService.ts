import { db } from '$lib/client/firebase'
import { collection, getDocs } from 'firebase/firestore'

/**
 * Service providing Data Access Layer for announcements.
 */
export const announcementService = {
  /**
   * Fetches all announcements.
   */
  async fetchAnnouncements(): Promise<Data.Announcement<'client'>[]> {
    const snapshot = await getDocs(collection(db, 'announcements'))
    return snapshot.docs.map(
      (docSnap) => docSnap.data() as Data.Announcement<'client'>,
    )
  },
}
