/**
 * Maps template name to its compiled HTML.
 *
 * The values are generated from `src/lib/emails/templates/*.mjml` by
 * `yarn email:build`; this file lists them so the set of sendable emails is
 * one greppable place. `yarn email:build --check` fails if the two disagree.
 */
import { actionEmailTemplate } from '$lib/data/emailTemplates/actionEmailTemplate'
import { applicationSubmittedEmailTemplate } from '$lib/data/emailTemplates/applicationSubmittedEmailTemplate'
import { classReminderEmailTemplate } from '$lib/data/emailTemplates/classReminderEmailTemplate'
import { communityServiceEmailTemplate } from '$lib/data/emailTemplates/communityServiceEmailTemplate'
import { inPersonClassEnrolledEmailTemplate } from '$lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate'
import { interviewRequestedEmailTemplate } from '$lib/data/emailTemplates/interviewRequestedEmailTemplate'
import { interviewScheduledEmailTemplate } from '$lib/data/emailTemplates/interviewScheduledEmailTemplate'
import { onlineClassEnrolledEmailTemplate } from '$lib/data/emailTemplates/onlineClassEnrolledEmailTemplate'
import { registrationSubmittedEmailTemplate } from '$lib/data/emailTemplates/registrationSubmittedEmailTemplate'
import { substituteClassEmailTemplate } from '$lib/data/emailTemplates/substituteClassEmailTemplate'

export const EMAIL_TEMPLATES = {
  actionEmailTemplate,
  applicationSubmittedEmailTemplate,
  classReminderEmailTemplate,
  communityServiceEmailTemplate,
  inPersonClassEnrolledEmailTemplate,
  interviewRequestedEmailTemplate,
  interviewScheduledEmailTemplate,
  onlineClassEnrolledEmailTemplate,
  registrationSubmittedEmailTemplate,
  substituteClassEmailTemplate,
} as const

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES
