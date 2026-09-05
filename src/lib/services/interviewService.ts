import { dev } from '$app/environment'
import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  interviewCollection,
} from '$lib/data/collections'
import { formatDateLocal, timestampToDate } from '$lib/utils'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import type { InterviewRequestBody } from '../../routes/api/interview/+server'
import type { SlotRequestRequestBody } from '../../routes/api/slotRequest/+server'

export interface InterviewFetchResult {
  scheduledInterview: Data.InterviewSlot | null
  availableSlots: Data.InterviewSlot[]
}

/**
 * Service providing Data Access Layer for instructor interview scheduling.
 */
export const interviewService = {
  /**
   * Fetches this user's already-scheduled interview (if any, for the current
   * application cycle) and the list of currently-available slots to book.
   */
  async fetchInterviewData(
    uid: string,
    semesterDates: Data.SemesterDates,
  ): Promise<InterviewFetchResult> {
    const q = query(collection(db, interviewCollection))
    const querySnapshot = await getDocs(q)

    let scheduledInterview: Data.InterviewSlot | null = null
    const availableSlots: Data.InterviewSlot[] = []

    querySnapshot.forEach((docSnap) => {
      const interviewInfo = docSnap.data()
      if (
        interviewInfo['intervieweeId'] === uid &&
        timestampToDate(interviewInfo['date']) >
          new Date(semesterDates.returningInstructorAppsOpen)
      ) {
        scheduledInterview = {
          ...interviewInfo,
          id: docSnap.id,
          date: formatDateLocal(new Date(interviewInfo['date'].seconds * 1000)),
          interviewSlotStatus:
            new Date(interviewInfo['date'].seconds * 1000) < new Date()
              ? 'completed'
              : interviewInfo['interviewSlotStatus'],
        } as Data.InterviewSlot
      } else {
        const interviewDate = new Date(interviewInfo['date'].seconds * 1000)
        const inFourHours = new Date(new Date().getTime() + 4 * 60 * 60 * 1000)
        if (
          interviewInfo['interviewSlotStatus'] === 'available' &&
          interviewDate > inFourHours &&
          (interviewDate < new Date(semesterDates.instructorOrientation) || dev)
        ) {
          availableSlots.push({
            ...interviewInfo,
            id: docSnap.id,
            date: formatDateLocal(
              new Date(interviewInfo['date'].seconds * 1000),
            ),
          } as Data.InterviewSlot)
        }
      }
    })

    availableSlots.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    return { scheduledInterview, availableSlots }
  },

  /**
   * Re-checks that a slot is still available immediately before booking, to
   * guard against a race with another applicant.
   */
  async confirmSlotAvailable(slotId: string): Promise<boolean> {
    const docSnap = await getDoc(doc(db, interviewCollection, slotId))
    return docSnap.data()?.interviewSlotStatus === 'available'
  },

  /**
   * Books an interview slot for the current user: marks the application as
   * scheduled, claims the slot, and sends the confirmation email. A failed
   * email send is logged, not thrown - the booking itself still succeeds.
   */
  async bookInterviewSlot(
    slot: Data.InterviewSlot,
    currentUser: Data.User.Store,
  ): Promise<void> {
    await updateDoc(doc(db, applicationsCollection, currentUser.object.uid), {
      'meta.interview': true,
    })

    await updateDoc(doc(db, interviewCollection, slot.id), {
      interviewSlotStatus: slot.interviewSlotStatus,
      intervieweeFirstName: currentUser.profile.firstName,
      intervieweeLastName: currentUser.profile.lastName,
      intervieweeEmail: currentUser.object.email,
      intervieweeId: currentUser.object.uid,
    })

    // Uid plus the stored address: the server prefers the uid and resolves the
    // interviewer's current address from Auth, falling back to this one when
    // the uid is missing or names no Auth account. Only the server can tell
    // which, so the client sends both and the server logs any fallback.
    const payload: InterviewRequestBody = {
      interviewerUid: slot.interviewerUid || undefined,
      email: slot.interviewerEmail,
      date: slot.date,
      link: slot.meetingLink,
      interviewer: slot.interviewerName,
      firstName: currentUser.profile.firstName,
    }

    const res = await fetch('/api/interview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const { message } = await res.json().catch(() => ({}))
      console.error(
        '[interviewService] Email notification send error:',
        message || 'Unknown error',
      )
    }
  },

  /**
   * Requests a new interview timeslot be added, and notifies via email.
   */
  async requestInterviewSlot(
    dateToAdd: string,
    currentUser: Data.User.Store,
  ): Promise<void> {
    await setDoc(
      doc(
        db,
        'interviewTimeRequests',
        currentUser.object.uid + '-' + dateToAdd,
      ),
      {
        uid: currentUser.object.uid,
        firstName: currentUser.profile.firstName,
        lastName: currentUser.profile.lastName,
        email: currentUser.object.email,
        date: new Date(dateToAdd),
      },
    )

    // No email: the handler has used the session's verified address since
    // Phase 1, so intervieweeEmail was already dead on arrival.
    const payload: SlotRequestRequestBody = {
      firstName: currentUser.profile.firstName,
      timeSlot: formatDateLocal(new Date(dateToAdd)),
    }
    const res = await fetch('/api/slotRequest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const { message } = await res.json()
      console.error('Interview slot request failed:', message)
    }
  },
}
