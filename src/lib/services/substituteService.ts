import { db } from '$lib/client/firebase'
import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import {
  buildSubstituteApiPayload,
  parseSubRequestDocs,
  subRequestClassId,
  subRequestDocId,
  type SubClassesDataResult,
} from '$lib/helpers/subClasses'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

/**
 * Service providing Data Access Layer for substitute requests and class substitution.
 */
export const substituteService = {
  /**
   * Fetches and categorizes substitute requests for a user.
   */
  async fetchUserSubRequests(userId: string): Promise<SubClassesDataResult> {
    const q = query(collection(db, substituteRequestsCollection))
    const querySnapshot = await getDocs(q)
    return parseSubRequestDocs(querySnapshot.docs, userId)
  },

  /**
   * Counts substitute requests this user fully completed (including feedback)
   * as the substitute instructor - used for community service hour tallies.
   */
  async countCompletedSubClasses(userId: string): Promise<number> {
    const q = query(collection(db, substituteRequestsCollection))
    const querySnapshot = await getDocs(q)
    let count = 0
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as Data.SubRequest
      if (
        data.subInstructorId === userId &&
        data.subRequestStatus === SubRequestStatus.NoSubstituteNeeded
      ) {
        count += 1
      }
    })
    return count
  },

  /**
   * Creates or updates a substitute request doc.
   */
  async saveSubRequest(
    subRequest: Data.SubRequest,
    originalClassNumber?: number,
  ): Promise<void> {
    // Keyed by the class, never by whoever is signed in: an edit has to land
    // on the document the request was created at, and a co-instructor editing
    // a request is not the uid in that class's id anyway.
    const classId = subRequestClassId(subRequest.id)
    if (!classId) {
      throw new Error(
        `Cannot save a sub request without a class: id was "${subRequest.id}"`,
      )
    }

    const docRef = doc(
      db,
      substituteRequestsCollection,
      subRequestDocId(classId, subRequest.classNumber),
    )
    // `id` is stored as the class id at creation (see buildSubRequestPayload)
    // while the in-memory copy carries the document id, so it is restamped
    // rather than written back as read.
    await setDoc(docRef, { ...subRequest, id: classId })

    // Moving a request to another session moves the document, so the one it
    // came from has to go.
    if (
      originalClassNumber !== undefined &&
      subRequest.classNumber !== originalClassNumber
    ) {
      await this.deleteSubRequest(subRequestDocId(classId, originalClassNumber))
    }
  },

  /**
   * Deletes a substitute request doc.
   */
  async deleteSubRequest(subRequestId: string): Promise<void> {
    // The document id as read, rather than one rebuilt from the signed-in
    // user - deleting a document that does not exist succeeds silently, so
    // getting this wrong reported success and left the request standing.
    const docRef = doc(db, substituteRequestsCollection, subRequestId)
    await deleteDoc(docRef)
  },

  /**
   * Signs up a user to substitute for a class slot and calls API.
   */
  async claimSubstituteSlot(
    classToSub: Data.SubRequest,
    user: Data.User.Store,
  ): Promise<void> {
    const classToSubDoc = doc(db, substituteRequestsCollection, classToSub.id)

    await updateDoc(classToSubDoc, {
      subRequestStatus: SubRequestStatus.SubstituteFound,
      subInstructorId: user.object.uid,
      subInstructorFirstName: user.profile.firstName,
      subInstructorEmail: user.object.email,
    })

    const payload = buildSubstituteApiPayload(
      user.profile.firstName,
      classToSub,
    )

    const response = await fetch('api/substitute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('Failed to submit substitute signup request')
    }
  },

  /**
   * Records completed class session date and updates substitute request status.
   */
  async recordSubstituteClassSession(
    subRequestId: string,
    classId: string,
    classNumber: number,
    dateOfClass: any,
  ): Promise<Data.Class> {
    const classDocRef = doc(db, classesCollection, classId)
    const classSnap = await getDoc(classDocRef)
    if (!classSnap.exists()) {
      throw new Error('Class document not found.')
    }

    const classValues = classSnap.data() as Data.Class
    const classStatuses = [...classValues.classStatuses]
    const completedClassDates = [
      ...classValues.completedClassDates,
      dateOfClass,
    ]
    classStatuses[classNumber - 1] = ClassStatus.FeedbackIncomplete

    await updateDoc(classDocRef, {
      completedClassDates,
      classStatuses,
    })

    const subReqDocRef = doc(db, substituteRequestsCollection, subRequestId)
    await updateDoc(subReqDocRef, {
      subRequestStatus: SubRequestStatus.SubstituteFeedbackNeeded,
    })

    return classValues
  },
}
