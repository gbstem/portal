/**
 * Maps template name to its compiled HTML.
 *
 * The values are generated from `src/lib/emails/templates/*.mjml` by
 * `yarn email:build`; this file lists them so the set of sendable emails is
 * one greppable place. `yarn email:build --check` fails if the two disagree.
 */
import { actionEmailTemplate } from '#lib/data/emailTemplates/actionEmailTemplate.js'
import { applicationSubmittedEmailTemplate } from '#lib/data/emailTemplates/applicationSubmittedEmailTemplate.js'
import { classReminderEmailTemplate } from '#lib/data/emailTemplates/classReminderEmailTemplate.js'
import { communityServiceEmailTemplate } from '#lib/data/emailTemplates/communityServiceEmailTemplate.js'
import { inPersonClassEnrolledEmailTemplate } from '#lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate.js'
import { interviewRequestedEmailTemplate } from '#lib/data/emailTemplates/interviewRequestedEmailTemplate.js'
import { interviewScheduledEmailTemplate } from '#lib/data/emailTemplates/interviewScheduledEmailTemplate.js'
import { onlineClassEnrolledEmailTemplate } from '#lib/data/emailTemplates/onlineClassEnrolledEmailTemplate.js'
import { registrationSubmittedEmailTemplate } from '#lib/data/emailTemplates/registrationSubmittedEmailTemplate.js'
import { substituteClassEmailTemplate } from '#lib/data/emailTemplates/substituteClassEmailTemplate.js'

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
