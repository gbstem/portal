import { alert } from '$lib/stores'
import { normalizeCapitals } from '$lib/utils'
import type Student from '../types/Student'
import type { RemindStudentsRequestBody } from '../../../routes/api/remindStudents/+server'

/**
 * Send a class reminder email to the student
 * @param studentName The name of the student to send the email to, use "all" if you want to send it ot all of them
 * @param studentEmail The email of the student to send the email to
 * @param instructorName The name of the instructor
 * @param instructorUids The uids of every instructor on the class, the sender
 *   included; the server drops the sender, resolves the rest to their current
 *   email addresses and cc's them on the reminder
 * @param className The name of the class
 * @param nextMeetingTime The time of the next class
 */
function sendClassReminder(opts: {
  studentList: Student[]
  studentName?: string
  studentEmail?: string
  instructorName: string
  instructorUids: string[]
  className: string
  nextMeetingTime: string
}) {
  // destructure
  const {
    studentList,
    studentName,
    studentEmail,
    instructorName,
    instructorUids,
    className,
    nextMeetingTime,
  } = opts

  /* if student name is not specified, assume it is all */
  if (!studentEmail || !studentEmail) {
    const confirmSend = confirm('Send class reminder to all students?')
    if (confirmSend) {
      if (nextMeetingTime === 'No Upcoming Classes') {
        alert.trigger('error', 'No upcoming classes found!')
        return
      }
      studentList.map((student) => {
        const payload: RemindStudentsRequestBody = {
          name: normalizeCapitals(student.name),
          email: student.email,
          instructorUids: instructorUids,
          class: className,
          classTime: nextMeetingTime,
          instructorName: normalizeCapitals(instructorName),
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
            const { message } = await res.json()
            alert.trigger('error', message)
          }
        })
      })
    }
  } else {
    const confirmSend = confirm(
      'Send class reminder to student ' + studentName + '?',
    )
    if (confirmSend) {
      if (nextMeetingTime === 'No Upcoming Classes') {
        alert.trigger('error', 'No upcoming classes found!')
        return
      }
      const payload: RemindStudentsRequestBody = {
        name: studentName || '',
        email: studentEmail || '',
        instructorUids: instructorUids,
        class: className,
        classTime: nextMeetingTime,
        instructorName: normalizeCapitals(instructorName),
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
            'Reminder email was sent to ' + studentName + '!',
          )
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
      })
    }
  }
}

export default sendClassReminder
