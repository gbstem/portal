import { alert } from '$lib/stores'
import type { ClassRemindStudentsRequestBody } from '../../../routes/api/remindStudents/+server'

export interface SendClassReminderOptions {
  classId: string
  nextMeetingTime: string
  studentUid?: string
  studentName?: string
  subRequestId?: string
}

/**
 * Sends a class reminder email to all students in a class or an individual student.
 * Server resolves recipient emails and authorization directly from the class document.
 */
function sendClassReminder(opts: SendClassReminderOptions) {
  const { classId, studentUid, studentName, nextMeetingTime, subRequestId } =
    opts

  if (!studentUid) {
    const confirmSend = confirm('Send class reminder to all students?')
    if (confirmSend) {
      if (nextMeetingTime === 'No Upcoming Classes') {
        alert.trigger('error', 'No upcoming classes found!')
        return
      }
      const payload: ClassRemindStudentsRequestBody = {
        classId,
        classTime: nextMeetingTime,
        subRequestId,
      }
      fetch('/api/remindStudents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger('success', 'Reminder emails were sent!')
        } else {
          const { message } = await res.json().catch(() => ({}))
          alert.trigger('error', message || 'Failed to send reminder emails.')
        }
      })
    }
  } else {
    const confirmSend = confirm(
      'Send class reminder to student ' + (studentName || '') + '?',
    )
    if (confirmSend) {
      if (nextMeetingTime === 'No Upcoming Classes') {
        alert.trigger('error', 'No upcoming classes found!')
        return
      }
      const payload: ClassRemindStudentsRequestBody = {
        classId,
        classTime: nextMeetingTime,
        studentUid,
        subRequestId,
      }
      fetch('/api/remindStudents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger(
            'success',
            'Reminder email was sent to ' + (studentName || '') + '!',
          )
        } else {
          const { message } = await res.json().catch(() => ({}))
          alert.trigger('error', message || 'Failed to send reminder email.')
        }
      })
    }
  }
}

export default sendClassReminder
