import { db } from '$lib/client/firebase'
import { classesCollection } from '$lib/data/collections'
import { alert } from '$lib/stores'
import type { ClassValue } from 'clsx'
import clsx from 'clsx'
import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { twMerge } from 'tailwind-merge'

export function cn(...classes: Array<ClassValue>) {
  return twMerge(clsx(...classes))
}

export function clickOutside(node: HTMLElement) {
  function handleClick(e: MouseEvent) {
    if (!node.contains(e.target as HTMLElement)) {
      node.dispatchEvent(new CustomEvent('outclick'))
    }
  }
  document.addEventListener('click', handleClick, true)
  return {
    destroy() {
      document.removeEventListener('click', handleClick, true)
    },
  }
}

export function trapFocus(node: HTMLElement) {
  const previous = document.activeElement as HTMLElement
  function focusable() {
    return Array.from(
      node.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) as NodeListOf<HTMLElement>,
    )
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const current = document.activeElement
    const elements = focusable()
    const first = elements.at(0) as HTMLElement
    const last = elements.at(-1) as HTMLElement
    if (event.shiftKey && current === first) {
      last.focus()
      event.preventDefault()
    }
    if (!event.shiftKey && current === last) {
      first.focus()
      event.preventDefault()
    }
  }
  focusable()[0]?.focus()
  node.addEventListener('keydown', handleKeyDown)
  return {
    destroy() {
      node.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    },
  }
}

// replace html template with data
export function addDataToHtmlTemplate(
  html: string,
  template: { data: Record<string, any> },
): string {
  const htmlBody = html.replace(/{{(.*?)}}/g, (_: string, key: string) => {
    const keys = key.trim().split('.')
    let value: any = template.data
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return ''
      }
    }
    return String(value ?? '')
  })
  return htmlBody
}

export function formatTime24to12(time24: string): string {
  // Split the string by ":" to obtain hours and minutes
  const [hours24, minutes] = time24.split(':')

  // Parse the hours and minutes to integers
  const hours24Int = parseInt(hours24, 10)
  const minutesInt = parseInt(minutes, 10)

  // Create a date object at January 1, 2000, at the specified hours and minutes
  const date = new Date(2000, 0, 1, hours24Int, minutesInt)

  // Return the formatted time string in 12-hour format with AM/PM
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  })
}

export function formatClassTimes(
  classDays: string[],
  classTimes: string[],
): string[] {
  return classDays.map(
    (day, index) => `${day} at ${formatTime24to12(classTimes[index])}`,
  )
}

export const formatDate = (date: Date) => {
  return date.toLocaleString('en-US', {
    weekday: 'short', // long, short, narrow
    month: 'short', // numeric, 2-digit, long, short, narrow
    day: 'numeric', // numeric, 2-digit
    hour: 'numeric', // numeric, 2-digit
    minute: 'numeric', // numeric, 2-digit
    hour12: true, // use 12-hour time format with AM/PM
  })
}

export function formatDateString(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateLocal(date: Date) {
  return date.toLocaleString('en-US', {
    weekday: 'long', // long, short, narrow
    month: 'long', // numeric, 2-digit, long, short, narrow
    day: 'numeric', // numeric, 2-digit
    hour: 'numeric', // numeric, 2-digit
    minute: 'numeric', // numeric, 2-digit
    hour12: true, // use 12-hour time format with AM/PM
    timeZoneName: 'long',
  })
}

export function formatDateStringLocal(time: string) {
  const date = new Date(time)
  return date.toLocaleString('en-US', {
    weekday: 'long', // long, short, narrow
    month: 'long', // numeric, 2-digit, long, short, narrow
    day: 'numeric', // numeric, 2-digit
    hour: 'numeric', // numeric, 2-digit
    minute: 'numeric', // numeric, 2-digit
    hour12: true, // use 12-hour time format with AM/PM
    timeZoneName: 'long',
  })
}

export const timestampToDate = (timestamp: Timestamp | Date) => {
  if (timestamp instanceof Date) {
    return timestamp
  }
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date(timestamp.seconds * 1000)
  }
  return new Date(timestamp)
}

export const classTodayHeld = (datesHeld: Date[]) => {
  return (
    datesHeld.filter(
      (date) =>
        new Date().toDateString() === timestampToDate(date).toDateString() &&
        new Date() > date,
    ).length > 0
  )
}

export function normalizeCapitals(name: string) {
  if (name === undefined) return ''
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Replace <br> and block elements with new lines
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc
    .querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, ul, ol, li')
    .forEach((block) => {
      block.append(document.createTextNode('\n'))
    })

  return doc.body.textContent?.replace(/\n+/g, '\n').trim() || ''
}

export function writeToClipboard(text: string): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== 'function'
  ) {
    return Promise.reject(new Error('Clipboard API not supported'))
  }
  const promise = navigator.clipboard.writeText(text)
  if (promise && typeof promise.then === 'function') {
    return promise
  }
  return Promise.resolve()
}

export function copyToClipboard(emailHtmlContent: string) {
  const el = document.createElement('textarea')
  el.value = htmlToPlainText(emailHtmlContent)
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
  alert.trigger('success', 'Email copied to clipboard!')
}

export function copyEmails(emails: Array<string | null | undefined>) {
  const cleanEmails = emails
    .filter(
      (email): email is string =>
        typeof email === 'string' && email.trim() !== '',
    )
    .map((email) => email.trim())
    .sort()
  writeToClipboard(cleanEmails.join(', '))
    .then(() => {
      alert.trigger('success', 'Emails copied to clipboard!')
    })
    .catch(() => {
      alert.trigger('error', 'Failed to copy emails to clipboard!')
    })
}

export function toLocalISOString(date: Date) {
  const pad = (number: number) => (number < 10 ? '0' + number : number)

  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1) // JavaScript months are 0-indexed.
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())

  return `${year}-${month}-${day}T${hour}:${minute}`.slice(0, 16)
}

export function cleanEnvVar(value: string | undefined): string | undefined {
  if (!value) return ''

  const trimmed = value.trim()
  const firstChar = trimmed[0]
  const lastChar = trimmed[trimmed.length - 1]

  // Check if the string is wrapped in matching single or double quotes
  if (
    (firstChar === '"' && lastChar === '"') ||
    (firstChar === "'" && lastChar === "'")
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export const isClassUpcoming = (date: Date) => {
  return (
    date.getTime() > Date.now() &&
    // Check if the class is within the next 30 minutes
    Math.abs(date.getTime() - new Date().getTime()) / (1000 * 60) < 30
  )
}

/**
 * Get all classes that an instructor has access to (both owned and co-taught)
 * @param instructorUID - The instructor's Firebase UID
 * @param instructorEmail - The instructor's email address
 * @returns Object with classId as key and class data as value
 */
export async function getInstructorClasses(
  instructorUID: string,
  instructorEmail: string,
): Promise<{ [classId: string]: Data.Class }> {
  try {
    // Get instructor's class access mapping using email
    const instructorClassesDoc = await getDoc(
      doc(db, 'instructorClasses', instructorEmail),
    )
    let accessibleClassIds: string[] = []

    if (instructorClassesDoc.exists()) {
      // Use mapping if it exists
      accessibleClassIds = instructorClassesDoc.data()?.classIds || []
    }

    // Also include classes created by this instructor (for backward compatibility)
    const allClassesSnapshot = await getDocs(collection(db, classesCollection))
    const ownedClassIds: string[] = []

    allClassesSnapshot.forEach((doc) => {
      if (doc.id.startsWith(instructorUID + '-')) {
        ownedClassIds.push(doc.id)
      }
    })

    // Combine and deduplicate
    const allClassIds = [...new Set([...accessibleClassIds, ...ownedClassIds])]

    // Fetch all accessible classes
    const classPromises = allClassIds.map((classId) =>
      getDoc(doc(db, classesCollection, classId)),
    )

    const classDocs = await Promise.all(classPromises)
    const classes: { [classId: string]: Data.Class } = {}

    classDocs.forEach((classDoc, index) => {
      if (classDoc.exists()) {
        const classData = classDoc.data() as Data.Class
        // Convert Firestore timestamps to dates
        if (classData.meetingTimes) {
          classData.meetingTimes = classData.meetingTimes.map(
            (time: Timestamp | Date) => timestampToDate(time),
          )
        }
        if (classData.completedClassDates) {
          classData.completedClassDates = classData.completedClassDates.map(
            (time: Timestamp | Date) => timestampToDate(time),
          )
        }
        classes[allClassIds[index]] = classData
      }
    })

    return classes
  } catch (error) {
    console.error('Error fetching instructor classes:', error)
    return {}
  }
}

/**
 * Update instructor class mappings when a class is created or modified
 * @param classId - The class ID
 * @param mainInstructorEmail - The main instructor's email
 * @param otherInstructorEmails - Comma-separated co-instructor emails
 */
export async function updateInstructorClassMappings(
  classId: string,
  mainInstructorEmail: string,
  otherInstructorEmails: string,
): Promise<void> {
  try {
    // Always ensure main instructor has access
    await addInstructorToClass(mainInstructorEmail, classId)

    if (otherInstructorEmails.trim()) {
      // Parse co-instructor emails
      const coInstructorEmails = otherInstructorEmails
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0)

      // Add access for each co-instructor
      for (const email of coInstructorEmails) {
        await addInstructorToClass(email, classId)
      }
    }
  } catch (error) {
    console.error('Error updating instructor class mappings:', error)
  }
}

/**
 * Add an instructor to a class mapping
 */
async function addInstructorToClass(
  instructorEmail: string,
  classId: string,
): Promise<void> {
  const instructorClassesRef = doc(db, 'instructorClasses', instructorEmail)

  try {
    // Try to update existing document
    await updateDoc(instructorClassesRef, {
      classIds: arrayUnion(classId),
    })
  } catch (error) {
    // If document doesn't exist, create it
    await setDoc(instructorClassesRef, {
      classIds: [classId],
    })
  }
}
