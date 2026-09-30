import { semesterDates } from '$lib/data/collections'
import {
  applicationDeadline,
  REGISTRATION_GRACE_DAYS,
  registrationWindow,
} from '$lib/server/semesterWindows'

const EMULATOR = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }

describe('applicationDeadline', () => {
  it('closes at midnight New York time after the due date', () => {
    // 09/18/26 is during EDT (UTC-4).
    expect(
      applicationDeadline({
        ...EMULATOR,
        E2E_INSTRUCTOR_APPS_DUE: '09/18/26',
      }).toISOString(),
    ).toBe('2026-09-19T04:00:00.000Z')
    // 01/15/27 is during EST (UTC-5).
    expect(
      applicationDeadline({
        ...EMULATOR,
        E2E_INSTRUCTOR_APPS_DUE: '01/15/27',
      }).toISOString(),
    ).toBe('2027-01-16T05:00:00.000Z')
  })

  it('ignores the e2e override outside the emulator', () => {
    expect(
      applicationDeadline({ E2E_INSTRUCTOR_APPS_DUE: '12/31/2099' }),
    ).toEqual(applicationDeadline({}))
  })
})

describe('registrationWindow', () => {
  it('opens at midnight New York time on registrationsOpen', () => {
    const opens = registrationWindow({}).opens
    const day = new Date(semesterDates.registrationsOpen)
    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(opens),
    ).toBe(`${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()}, 00`)
  })

  it('closes a grace week after the due date, as the form always has', () => {
    expect(REGISTRATION_GRACE_DAYS).toBe(7)
    // Due 09/27/26 -> closed from the start of 10/04/26, EDT.
    expect(
      registrationWindow({
        ...EMULATOR,
        E2E_REGISTRATIONS_DUE: '09/27/26',
      }).closes.toISOString(),
    ).toBe('2026-10-04T04:00:00.000Z')
  })

  it('ignores the e2e override outside the emulator', () => {
    expect(
      registrationWindow({ E2E_REGISTRATIONS_DUE: '12/31/2099' }).closes,
    ).toEqual(registrationWindow({}).closes)
  })
})
