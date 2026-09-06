import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  instructorFeedbackCollection,
  withSemester,
} from '$lib/data/collections'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { adminDb } from '$lib/server/firebase'
import { authorizeSubstituteSession } from '$lib/server/substituteSessions'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const substituteFeedbackSchema = z.object({
  subRequestId: z.string().min(1, 'A substitute request is required'),
  date: z.string().min(1, 'Date of class is required'),
  feedback: z.string().min(1, 'Reflection/feedback is required'),
  // Keyed by student name, the way the roster renders them.
  attendanceList: z.record(z.object({ present: z.boolean() })),
  // Checked against the request rather than trusted: the form lets it be
  // typed, and a substitute is covering one specific session.
  classNumber: z.coerce.number().int().min(1),
})

export type SubstituteFeedbackRequestBody = z.infer<
  typeof substituteFeedbackSchema
>

export interface SubstituteFeedbackResponse {
  feedbackId: string
}

/**
 * Files a substitute's feedback for the class they covered.
 *
 * Server-side for the same reason as /api/substituteSession: marking the
 * session complete writes to the class document, which a substitute cannot
 * write from the browser. That failure was the quiet one - the feedback
 * document itself saved fine, so the form said "Class Feedback saved!" while
 * the class was never updated and the request never left "feedback needed",
 * which is also the state community service hours are counted from. A
 * substitute could file feedback all semester and be credited for none of it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = substituteFeedbackSchema.parse(await request.json())
    const {
      subRequest,
      subRequestRef,
      classRef,
      classData,
      classId,
      classNumber,
    } = await authorizeSubstituteSession(user.uid, body.subRequestId)

    if (body.classNumber !== classNumber) {
      throw error(
        400,
        `That request is for class #${classNumber}, so its feedback has to be too.`,
      )
    }

    const feedbackCompleted = [...(classData.feedbackCompleted ?? [])]
    const classStatuses = [...(classData.classStatuses ?? [])]
    feedbackCompleted[classNumber - 1] = true
    classStatuses[classNumber - 1] = ClassStatus.EverythingComplete

    const feedbackId = `${classId}-${Date.now()}`
    const batch = adminDb.batch()
    batch.set(
      adminDb.doc(`${instructorFeedbackCollection}/${feedbackId}`),
      withSemester({
        date: body.date,
        feedback: body.feedback,
        attendanceList: body.attendanceList,
        classNumber,
        // Both read off the request, not the browser: this is the record of
        // who actually taught the session and which course it was.
        courseName: subRequest.course ?? '',
        instructorName: subRequest.subInstructorFirstName ?? '',
      }),
    )
    batch.update(classRef, { feedbackCompleted, classStatuses })
    // Closing the request out is what credits the substitute's community
    // service hours, so it belongs in the same batch as the feedback.
    batch.update(subRequestRef, {
      subRequestStatus: SubRequestStatus.NoSubstituteNeeded,
    })
    await batch.commit()

    const response: SubstituteFeedbackResponse = { feedbackId }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/substituteFeedback', err)
  }
}
