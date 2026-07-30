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
   * Creates or updates a substitute request doc.
   */
  async saveSubRequest(
    userUid: string,
    subRequest: Data.SubRequest,
    originalClassNumber?: number,
  ): Promise<void> {
    const docRef = doc(
      db,
      substituteRequestsCollection,
      `${userUid}---${subRequest.classNumber}`,
    )
    await setDoc(docRef, subRequest)

    if (
      originalClassNumber !== undefined &&
      subRequest.classNumber !== originalClassNumber
    ) {
      await this.deleteSubRequest(userUid, originalClassNumber)
    }
  },

  /**
   * Deletes a substitute request doc.
   */
  async deleteSubRequest(userUid: string, classNumber: number): Promise<void> {
    const docRef = doc(
      db,
      substituteRequestsCollection,
      `${userUid}---${classNumber}`,
    )
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
      user.object.email || '',
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
