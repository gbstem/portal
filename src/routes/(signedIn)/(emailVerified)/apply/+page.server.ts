import { env } from '$env/dynamic/private'
import {
  applicationDraftSchema,
  applicationSchema,
} from '$lib/components/forms/schemas'
import { verifyInstructor } from '$lib/server/apiHelpers'
import {
  applicationDeadline,
  loadApplication,
  saveApplicationDraft,
  submitApplication,
} from '$lib/server/instructorApplication'
import { fail, isHttpError } from '@sveltejs/kit'
import { message, superValidate } from 'sveltekit-superforms'
import { zod } from 'sveltekit-superforms/adapters'
import type { Actions, PageServerLoad } from './$types'

// Both actions post the same form, so they share its id: superforms only
// applies a result to the form whose id it carries.
const APPLY_FORM_ID = 'apply'

export const load: PageServerLoad = async ({ locals }) => {
  // Parents get RegistrationForm here, which still loads itself client-side.
  if (locals.user?.role !== 'instructor') return {}

  const application = await loadApplication(locals.user)
  const { values } = application
  const applyForm = await superValidate(
    {
      ...values,
      // Stored as whatever the client SDK wrote, which was a string on some
      // older drafts.
      academic: {
        ...values.academic,
        graduationYear: Number(values.academic.graduationYear),
      },
    },
    zod(applicationSchema),
    { id: APPLY_FORM_ID, errors: false },
  )
  return {
    applyForm,
    application: {
      firstName: application.firstName,
      lastName: application.lastName,
      submitted: application.submitted,
      deadlinePassed: new Date() >= applicationDeadline(env),
    },
  }
}

/** Turns a refusal from `instructorApplication` into a form message. */
function refused<T extends Parameters<typeof message>[0]>(
  form: T,
  err: unknown,
) {
  if (isHttpError(err)) {
    return message(form, err.body.message, { status: err.status as 400 })
  }
  throw err
}

export const actions: Actions = {
  saveApplication: async ({ request, locals }) => {
    const user = verifyInstructor(locals)
    const form = await superValidate(request, zod(applicationDraftSchema), {
      id: APPLY_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    try {
      await saveApplicationDraft(user, form.data)
    } catch (err) {
      return refused(form, err)
    }
    return message(form, 'Your progress was saved.')
  },

  submitApplication: async ({ request, locals }) => {
    const user = verifyInstructor(locals)
    const form = await superValidate(request, zod(applicationSchema), {
      id: APPLY_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    try {
      const { emailSent } = await submitApplication(
        user,
        form.data,
        applicationDeadline(env),
      )
      return message(
        form,
        emailSent
          ? 'Your application has been submitted!'
          : "Your application has been submitted, but we couldn't send the confirmation email.",
      )
    } catch (err) {
      return refused(form, err)
    }
  },
}
