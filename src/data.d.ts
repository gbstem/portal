import type { Timestamp as ServerTimestamp } from 'firebase-admin/firestore'
import type { Timestamp as ClientTimestamp } from 'firebase/firestore'
import type { User as ClientUser } from 'firebase/auth'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'

declare global {
  declare namespace Data {
    type Role = 'admin' | 'reviewer' | 'instructor' | 'student'

    type Token<T extends 'client' | 'server' | 'pojo'> = {
      role: Role
      expires: T extends 'client'
        ? ClientTimestamp
        : T extends 'server'
          ? ServerTimestamp
          : Date
      consumable: boolean
      consumers: Array<string>
    }

    namespace User {
      type Peek = {
        uid: string
        email: string
        emailVerified: boolean
        role: Role
      }
      type Profile = {
        firstName: string
        lastName: string
        id: string
        role: Role
      }
      type Store = {
        object: ClientUser
        profile: Profile
      }
    }

    type Resume = {
      url: string
      name: string
    }

    type Decision = 'accepted' | 'waitlisted' | 'rejected' | 'substitute'

    type EmailData = {
      subject: string
      from: string
      to: string
      cc: string
      replyTo: string
      text: string
      html: string
    }

    type SemesterDates = {
      classesEnd: string
      classesStart: string
      leadershipAppsDue: string
      newInstructorAppsDue: string
      returningInstructorAppsDue: string
      instructorOrientation: string
      newInstructorAppsOpen: string
      returningInstructorAppsOpen: string
      studentOrientation: string
      registrationsOpen: string
      registrationsDue: string
      parentOrientation: string
    }

    type InterviewSlot = {
      date: string
      id: string
      interviewerName: string
      intervieweeFirstName: string
      intervieweeLastName: string
      intervieweeEmail: string
      intervieweeId: string
      interviewerEmail: string
      interviewSlotStatus: string
      meetingLink: string
    }

    type Application = {
      personal: {
        email: string
        firstName: string
        lastName: string
        dateOfBirth: string
        gender: string
        race: string[]
        phoneNumber: string
      }
      academic: {
        school: string
        graduationYear: string
      }
      program: {
        courses: string[]
        preferences: string
        timeSlots: string
        notAvailable: string
        inPerson: boolean
        reason: string
      }
      essay: {
        taughtBefore: boolean
        academicBackground: string
        teachingScenario: string
        why: string
      }
      agreements: {
        entireProgram: boolean
        timeCommitment: boolean
        submitting: boolean
      }
      meta: {
        id: string
        uid: string
        submitted: boolean
        interview: boolean
      }
      timestamps: {
        created: Timestamp
        updated: Timestamp
      }
    }

    type Registration = {
      personal: {
        email: string
        studentFirstName: string
        studentLastName: string
        parentFirstName: string
        parentLastName: string
        secondaryEmail: string
        dateOfBirth: string
        gender: string
        race: string[]
        phoneNumber: string
        frlp: string
        parentEducation: string
      }
      academic: {
        school: string
        grade: string
      }
      program: {
        csCourse?: string
        mathCourse?: string
        engineeringCourse?: string
        scienceCourse?: string
        reason: string
        inPerson: boolean
      }
      agreements: {
        bypassAgeLimits: boolean
        entireProgram: boolean
        timeCommitment: boolean
        mediaRelease: boolean
        submitting: boolean
      }
      inPerson: {
        allergies: string
        parentPickup: string
      }
      meta: {
        id: string
        uid: string
        submitted: boolean
      }
      timestamps: {
        created: Timestamp
        updated: Timestamp
      }
    }

    type Class = {
      classDay1: string
      classTime1: string
      classDay2: string
      classTime2: string
      meetingLink: string
      gradeRecommendation: string
      course: string
      submitting: boolean
      meetingTimes: Date[]
      completedClassDates: Date[]
      feedbackCompleted: boolean[]
      classStatuses: string[]
      instructorFirstName: string
      instructorLastName: string
      instructorEmail: string
      otherInstructorEmails: string
      classCap: number
      students: string[]
      online: boolean
    }

    type ClassDetails = {
      id: string
      classStatuses: string[]
      meetingTimes: Date[]
      completedClassDates: Date[]
      feedbackCompleted: boolean[]
      otherInstructorEmails: string
      course: string
      instructorFirstName: string
      instructorLastName: string
      instructorEmail: string
      meetingLink: string
      students: string[]
    }

    type SubRequest = {
      id: string
      classNumber: number
      course: string
      dateOfClass: Date
      originalInstructorEmail: string
      subInstructorId: string
      subInstructorFirstName: string
      subInstructorEmail: string
      subRequestStatus: SubRequestStatus
      link: string
      notes: string
    }

    type Announcement<T extends 'client' | 'server' | 'pojo'> = {
      title: string
      content: string
      timestamp: T extends 'client'
        ? ClientTimestamp
        : T extends 'server'
          ? ServerTimestamp
          : Date
    }
  }
}
