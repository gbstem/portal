import { formatDateString } from '$lib/utils'

/**
 * Generates email based on changes to meeting times
 * @param originalMeetingTimes
 * @param editedMeetingTimes
 * @returns html email template
 */
function generateMeetingTimeChangeEmail(
  originalMeetingTimes: string[],
  editedMeetingTimes: string[],
): string {
  const addedClasses: string[] = []
  const removedClasses: string[] = []

  // Check for deletions
  originalMeetingTimes.forEach((time) => {
    if (!editedMeetingTimes.includes(time)) {
      removedClasses.push(`Class on ${formatDateString(time)}`)
    }
  })

  // Check for additions
  editedMeetingTimes.forEach((time) => {
    if (!originalMeetingTimes.includes(time)) {
      addedClasses.push(`Class added on ${formatDateString(time)}`)
    }
  })

  // Construct the email content in HTML
  let emailBody = '<html><body>'
  emailBody += '<p>Dear gbSTEM Parents,</p>'
  emailBody +=
    '<p>I would like to update you on some changes to our class meeting times:</p>'

  if (addedClasses.length > 0) {
    emailBody += '<p><strong>Classes Added:</strong></p><ul>'
    addedClasses.forEach((addClass) => {
      emailBody += `<li>${addClass}</li>`
    })
    emailBody += '</ul>'
  }

  if (removedClasses.length > 0) {
    emailBody += '<p><strong>Classes Removed:</strong></p><ul>'
    removedClasses.forEach((removeClass) => {
      emailBody += `<li>${removeClass}</li>`
    })
    emailBody += '</ul>'
  }

  if (addedClasses.length === 0 && removedClasses.length === 0) {
    return ''
  }

  emailBody +=
    '<p>Please take note of these changes. If you have any questions or concerns, feel free to contact me.</p>'
  emailBody += '<p>Best,<br>[Your Name]</p>'
  emailBody += '</body></html>'

  // Return the full email content in HTML format
  return emailBody
}

export default generateMeetingTimeChangeEmail
