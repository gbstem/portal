import { db } from '$lib/client/firebase'
import { formatDateLocal } from '$lib/utils'
import { doc, setDoc } from 'firebase/firestore'
import type {
  InterviewBookingRequestBody,
  InterviewBookingResponse,
  InterviewDataResponse,
} from '../../routes/api/interview/+server'
import type { SlotRequestRequestBody } from '../../routes/api/slotRequest/+server'

/** A slot the applicant could book, its date in the viewer's local time. */
export interface InterviewSlotOption {
  id: string
  date: string
  interviewerName: string
}

/** The applicant's interview, its date in the viewer's local time. */
export interface BookedInterviewDetails {
  id: string
  date: string
  interviewerName: string
  meetingLink: string
  interviewSlotStatus: string
}

export interface InterviewFetchResult {
  scheduledInterview: BookedInterviewDetails | null
  availableSlots: InterviewSlotOption[]
}

const localDate = (iso: string) => formatDateLocal(new Date(iso))

/**
 * Service providing Data Access Layer for instructor interview scheduling.
 */
export const interviewService = {
  /**
   * Fetches this user's already-scheduled interview (if any, for the current
   * application cycle) and the slots they could book, soonest first. Both come
   * from /api/interview, which reads the slots server-side.
   */
  async fetchInterviewData(): Promise<InterviewFetchResult> {
    const res = await fetch('/api/interview')
    if (!res.ok) {
      throw new Error(`Failed to load interview slots (${res.status})`)
    }
    const data = (await res.json()) as InterviewDataResponse
    return {
      scheduledInterview: data.scheduledInterview
        ? {
            ...data.scheduledInterview,
            date: localDate(data.scheduledInterview.date),
          }
        : null,
      availableSlots: data.availableSlots.map((slot) => ({
        ...slot,
        date: localDate(slot.date),
      })),
    }
  },

  /**
   * Books a slot for the signed-in user. The booking is a transaction
   * server-side, so a slot somebody else took first is refused with a message
   * to show. The confirmation email is sent from there too; a failed send is
   * logged, not thrown - the booking itself still stands.
   */
  async bookInterviewSlot(slotId: string): Promise<BookedInterviewDetails> {
    const payload: InterviewBookingRequestBody = { slotId }
    const res = await fetch('/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(body?.message || 'Failed to book interview')
    }
    const { interview, emailSent } = body as InterviewBookingResponse
    if (!emailSent) {
      console.error(
        `[interviewService] The confirmation email for interview ${interview.id} was not sent.`,
      )
    }
    return { ...interview, date: localDate(interview.date) }
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
