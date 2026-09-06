import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { adminDb } from '$lib/server/firebase'
import {
  alreadyRecorded,
  authorizeSubstituteSession,
} from '$lib/server/substituteSessions'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const substituteSessionSchema = z.object({
  // The document id, which carries the class and the session: everything else
  // this endpoint acts on is read from the request itself rather than taken
  // from the caller.
  subRequestId: z.string().min(1, 'A substitute request is required'),
})

export type SubstituteSessionRequestBody = z.infer<
  typeof substituteSessionSchema
>

export interface SubstituteSessionResponse {
  /** Where to send the substitute, read from the class rather than the client. */
  meetingLink: string
  /** True when this session had already been recorded as held. */
  alreadyRecorded: boolean
}

/**
 * Records that a substitute is holding a class they signed up to cover.
 *
 * Marks the session as held on the class and moves the request to
 * "feedback needed". Both writes used to happen in the browser, where
 * firestore.rules refused them for anyone who wasn't already an instructor of
 * the class - which a substitute never is.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = substituteSessionSchema.parse(await request.json())
    const { subRequest, subRequestRef, classRef, classData, classNumber } =
      await authorizeSubstituteSession(user.uid, body.subRequestId)

    const response: SubstituteSessionResponse = {
      meetingLink: classData.meetingLink ?? '',
      alreadyRecorded: alreadyRecorded(subRequest),
    }

    // Joining twice is an ordinary thing to do - a dropped call, a second
    // browser tab - and it used to append the date again each time. The
    // session is recorded once; the link comes back either way.
    if (response.alreadyRecorded) {
      return json(response)
    }

    const classStatuses = [...(classData.classStatuses ?? [])]
    classStatuses[classNumber - 1] = ClassStatus.FeedbackIncomplete

    // One batch, so a class that has been marked held always has a request
    // asking for its feedback - the two used to be sequential updates, either
    // of which could land without the other.
    const batch = adminDb.batch()
    batch.update(classRef, {
      completedClassDates: [
        ...(classData.completedClassDates ?? []),
        subRequest.dateOfClass,
      ],
      classStatuses,
    })
    batch.update(subRequestRef, {
      subRequestStatus: SubRequestStatus.SubstituteFeedbackNeeded,
    })
    await batch.commit()

    return json(response)
  } catch (err) {
    throw handleApiError('/api/substituteSession', err)
  }
}
