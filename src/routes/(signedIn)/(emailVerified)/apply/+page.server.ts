import { env } from '$env/dynamic/private'
import {
  applicationDraftSchema,
  applicationSchema,
  registrationDraftSchema,
  registrationSchema,
} from '$lib/components/forms/schemas'
import { maxChildrenPerAccount } from '$lib/data/collections'
import { verifyInstructor, verifyStudent } from '$lib/server/apiHelpers'
import {
  applicationDeadline,
  registrationWindow,
} from '$lib/server/semesterWindows'
import {
  loadApplication,
  saveApplicationDraft,
  submitApplication,
} from '$lib/server/instructorApplication'
import {
  isOpenableChild,
  listChildren,
  loadRegistration,
  saveRegistrationDraft,
  submitRegistration,
} from '$lib/server/studentRegistration'
import { error, fail, isHttpError, redirect } from '@sveltejs/kit'
import { message, superValidate } from 'sveltekit-superforms'
import { zod } from 'sveltekit-superforms/adapters'
import type { Actions, PageServerLoad } from './$types'

// Each form's two actions post the same form, so they share its id:
// superforms only applies a result to the form whose id it carries.
const APPLY_FORM_ID = 'apply'
const REGISTRATION_FORM_ID = 'registration'

export const load: PageServerLoad = async ({ locals, url }) => {
  // The (emailVerified) layout redirects too, but SvelteKit runs this load
  // alongside it rather than after, and loadApplication/loadRegistration
  // create draft documents, so without this an unverified account's visit
  // writes them before the layout's redirect lands.
  if (!locals.user?.emailVerified) {
    throw redirect(303, '/profile')
  }
  if (locals.user.role === 'instructor') {
    return loadApplicationPage(locals.user)
  }
  if (locals.user.role === 'student') {
    return loadRegistrationPage(locals.user, url)
  }
  return { page: null }
}

async function loadApplicationPage(user: Data.User.Peek) {
  const application = await loadApplication(user)
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
    page: 'application' as const,
    applyForm,
    application: {
      firstName: application.firstName,
      lastName: application.lastName,
      submitted: application.submitted,
      deadlinePassed: new Date() >= applicationDeadline(env),
    },
  }
}

/**
 * A parent's `/apply`: the picker's list of their children, and the form for
 * the one `?child=` selects (the first by default). Opening the next number
 * is how "Add Child Account" creates a child; anything past that, or past
 * `maxChildrenPerAccount`, goes back to the first.
 */
async function loadRegistrationPage(user: Data.User.Peek, url: URL) {
  const childNumber = Number(url.searchParams.get('child') ?? 1)
  const children = await listChildren(user.uid)
  if (!isOpenableChild(childNumber, children.length)) {
    redirect(303, '/apply')
  }

  const now = new Date()
  const window = registrationWindow(env)
  const isOpen = now >= window.opens
  const registration = await loadRegistration(user, childNumber, isOpen)
  if (registration && childNumber > children.length) {
    children.push({
      number: childNumber,
      name: `Child ${childNumber}`,
      submitted: false,
    })
  }
  const registrationForm = registration
    ? await superValidate(registration.values, zod(registrationSchema), {
        id: REGISTRATION_FORM_ID,
        errors: false,
      })
    : null
  return {
    page: 'registration' as const,
    children,
    childNumber,
    maxChildren: maxChildrenPerAccount,
    registrationForm,
    registration: registration && {
      studentFirstName: registration.studentFirstName,
      parentFirstName: registration.parentFirstName,
      parentLastName: registration.parentLastName,
      submitted: registration.submitted,
    },
    registrationWindow: { closed: now >= window.closes },
  }
}

/** The child a registration action is for, from its `&child=` parameter. */
function actionChild(url: URL): number {
  const childNumber = Number(url.searchParams.get('child'))
  if (
    !Number.isInteger(childNumber) ||
    childNumber < 1 ||
    childNumber > maxChildrenPerAccount
  ) {
    error(400, 'Choose a child to register.')
  }
  return childNumber
}

/** Turns a refusal from the server modules into a form message. */
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

  saveRegistration: async ({ request, locals, url }) => {
    const user = verifyStudent(locals)
    const childNumber = actionChild(url)
    const form = await superValidate(request, zod(registrationDraftSchema), {
      id: REGISTRATION_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    try {
      await saveRegistrationDraft(
        user,
        childNumber,
        form.data,
        registrationWindow(env),
      )
    } catch (err) {
      return refused(form, err)
    }
    return message(form, 'Your progress was saved.')
  },

  submitRegistration: async ({ request, locals, url }) => {
    const user = verifyStudent(locals)
    const childNumber = actionChild(url)
    const form = await superValidate(request, zod(registrationSchema), {
      id: REGISTRATION_FORM_ID,
    })
    if (!form.valid) return fail(400, { form })
    try {
      const { emailSent } = await submitRegistration(
        user,
        childNumber,
        form.data,
        registrationWindow(env),
      )
      return message(
        form,
        emailSent
          ? 'Your student account has been created!'
          : "Your student account has been created, but we couldn't send the confirmation email.",
      )
    } catch (err) {
      return refused(form, err)
    }
  },
}
