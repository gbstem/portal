import { errorMessage } from '#lib/shared/apiErrors.js'
import type { InterviewWindow } from '#lib/shared/interviews.js'
import { formatDateLocal } from '#lib/utils.js'
import type {
  AvailabilityRequestBody,
  AvailabilityResponse,
} from '../../routes/api/availability/+server'
import type {
  InterviewBookingRequestBody,
  InterviewBookingResponse,
  InterviewCancelResponse,
  InterviewDataResponse,
} from '../../routes/api/interview/+server'

/** The applicant's interview, its date in the viewer's local time. */
export interface BookedInterviewDetails {
  id: string
  date: string
  /** The same moment, for working out whether it's still to come. */
  at: Date
  interviewerName: string
  meetingLink: string
  interviewSlotStatus: string
}

/** What the applicant painted last. */
export interface SavedAvailability {
  times: Date[]
  updated: Date
}

export interface InterviewFetchResult {
  scheduledInterview: BookedInterviewDetails | null
  /** The times the applicant could book, soonest first. */
  availableTimes: Date[]
  /** The window the server will accept a booking or painted time in. */
  interviewWindow: InterviewWindow
  availability: SavedAvailability | null
}

const scheduled = (
  interview: InterviewBookingResponse['interview'],
): BookedInterviewDetails => ({
  ...interview,
  at: new Date(interview.date),
  date: formatDateLocal(new Date(interview.date)),
})

async function send<T>(
  method: string,
  url: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await errorMessage(res, fallback))
  }
  return res.json()
}

/**
 * Service providing Data Access Layer for instructor interview scheduling.
 */
export const interviewService = {
  /**
   * Fetches this user's already-scheduled interview (if any, for the current
   * application cycle), the times they could book, and what they last
   * painted as free. All come from /api/interview, which reads them
   * server-side.
   */
  async fetchInterviewData(): Promise<InterviewFetchResult> {
    const res = await fetch('/api/interview')
    if (!res.ok) {
      throw new Error(`Failed to load interview times (${res.status})`)
    }
    const data = (await res.json()) as InterviewDataResponse
    return {
      scheduledInterview: data.scheduledInterview
        ? scheduled(data.scheduledInterview)
        : null,
      availableTimes: data.availableTimes.map((time) => new Date(time)),
      interviewWindow: {
        opens: new Date(data.interviewWindow.opens),
        closes: new Date(data.interviewWindow.closes),
      },
      availability: data.availability
        ? {
            times: data.availability.times.map((time) => new Date(time)),
            updated: new Date(data.availability.updated),
          }
        : null,
    }
  },

  /**
   * Books the signed-in user an interview at `date`; the server picks which
   * interviewer's slot. With `reschedule`, their current interview is given
   * up in the same write. A time somebody else took first is refused with a
   * message to show. The confirmation email is sent from there too; a failed
   * send is logged, not thrown - the booking itself still stands.
   */
  async bookInterview(
    date: Date,
    { reschedule = false }: { reschedule?: boolean } = {},
  ): Promise<BookedInterviewDetails> {
    const { interview, emailSent } = await send<InterviewBookingResponse>(
      'POST',
      '/api/interview',
      {
        date: date.toISOString(),
        ...(reschedule ? { reschedule } : {}),
      } satisfies InterviewBookingRequestBody,
      'Failed to book interview',
    )
    if (!emailSent) {
      console.error(
        `[interviewService] The confirmation email for interview ${interview.id} was not sent.`,
      )
    }
    return scheduled(interview)
  },

  /** Cancels the signed-in user's interview, so they can book another. */
  async cancelInterview(): Promise<InterviewCancelResponse> {
    return send('DELETE', '/api/interview', undefined, 'Failed to cancel')
  },

  /**
   * Replaces the signed-in user's painted availability with `times`, for
   * interviewers to pick from; an empty list clears it. Admins are notified
   * server-side - see /api/availability. Resolves to the times kept.
   */
  async saveAvailability(times: Date[]): Promise<Date[]> {
    const saved = await send<AvailabilityResponse>(
      'PUT',
      '/api/availability',
      {
        times: times.map((time) => time.toISOString()),
      } satisfies AvailabilityRequestBody,
      'Failed to save your availability',
    )
    return saved.times.map((time) => new Date(time))
  },
}
