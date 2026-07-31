<script lang="ts">
  import { user } from '$lib/client/firebase'
  import Button from '$lib/components/Button.svelte'
  import Dialog from '$lib/components/Dialog.svelte'
  import DialogActions from '$lib/components/DialogActions.svelte'
  import {
    computeMeetingTimeChanges,
    computeUpdatedClassStatuses,
    findNextClassDateIndex,
  } from '$lib/helpers/classSchedule'
  import { classService } from '$lib/services/classService'
  import { alert } from '$lib/stores'
  import {
    classTodayHeld,
    copyEmails,
    copyToClipboard,
    formatDateString,
    normalizeCapitals,
    toLocalISOString,
  } from '$lib/utils'
  import { onMount } from 'svelte'
  import Card from './Card.svelte'
  import Input from './Input.svelte'
  import ClassDetailsForm from './forms/ClassDetailsForm.svelte'
  import InstructorFeedbackForm from './forms/InstructorFeedbackForm.svelte'
  import { ClassStatus } from './helpers/ClassStatus'
  import { generateCurriculumLink } from './helpers/curriculumLink'
  import sendClassReminder from './helpers/sendClassReminder'
  import type Student from './types/Student'

  interface Props {
    semesterDates: Data.SemesterDates
  }

  let { semesterDates }: Props = $props()
  let editMode: boolean = $state(false)
  let originalMeetingTimes: string[] = []
  let editedMeetingTimes: string[] = $state([])
  let values: Data.ClassDetails = $state({
    id: '',
    students: [],
    classStatuses: [],
    feedbackCompleted: [],
    instructorFirstName: '',
    instructorLastName: '',
    instructorEmail: '',
    otherInstructorEmails: '',
    course: '',
    meetingLink: '',
    meetingTimes: [],
    completedClassDates: [],
  })

  // index of the next class date from the list of meeting times
  let nextClassIndex = $state(-1)
  let classId = $state('')
  let instructorClasses: { [classId: string]: Data.ClassDetails } = $state({})
  let availableClassIds: string[] = $state([])
  let selectedClassId = $state('')
  let showEmailDialog = $state(false)
  let showFeedbackDialog = $state(false)
  let showClassDetailsDialog = $state(false)
  let showStudentListDialog = $state(false)
  let showSubRequestDialog = $state(false)
  let emailHtmlContent = $state('')
  let studentList: Student[] = $state([])
  let addingClass = $state(false)

  let classToBeAdded = $state('')
  let subRequestDate: string = $state('')
  let subRequestClassNumber: number = $state(0)
  let subRequestNotes: string = $state('')

  /**
   * Iterates through each student UID to get student info
   * @param studentUids
   */
  const getStudentList = async (studentUids: string[]) => {
    try {
      const fetchedStudents = await classService.fetchStudentList(studentUids)
      studentList = fetchedStudents
    } catch (err) {
      console.error('Failed to load student list:', err)
    }
  }

  function checkStatuses() {
    const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
      values.classStatuses,
      values.feedbackCompleted,
      values.meetingTimes,
    )

    if (hasChanged) {
      classService
        .updateClassStatuses(classId, updatedStatuses)
        .catch((err) => console.warn('Failed to update classStatuses:', err))
    }
  }

  async function updateMeetingTimes(
    newFeedback: boolean[],
    newClassStatuses: string[],
  ): Promise<void> {
    const meetingTimesDate = editedMeetingTimes.map((time) => new Date(time))
    await classService
      .updateMeetingTimes(
        classId,
        meetingTimesDate,
        newFeedback,
        newClassStatuses,
      )
      .then(() => {
        nextClassIndex = findNextClassDate()
        alert.trigger('success', 'Meeting times updated!')
      })
  }

  function cancelChanges(): void {
    editMode = false
    editedMeetingTimes = [...originalMeetingTimes]
    classService
      .updateMeetingTimes(
        classId,
        values.meetingTimes,
        values.feedbackCompleted,
        values.classStatuses,
      )
      .then(() => {
        alert.trigger('success', 'Changes cancelled!')
      })
  }

  function saveChanges(): void {
    editMode = false
    const changes = computeMeetingTimeChanges(
      originalMeetingTimes,
      editedMeetingTimes,
      values.feedbackCompleted,
      values.classStatuses,
    )

    emailHtmlContent = changes.emailHtmlContent
    showEmailDialog = emailHtmlContent !== ''
    editedMeetingTimes = changes.sortedEditedTimes

    originalMeetingTimes = [...editedMeetingTimes]
    values.meetingTimes = editedMeetingTimes.map(
      (time: string) => new Date(time),
    )
    values.feedbackCompleted = changes.newFeedback
    values.classStatuses = changes.newClassStatuses
    updateMeetingTimes(values.feedbackCompleted, values.classStatuses)
  }

  /**
   * Find the index of the next class date that hasn't passed yet from the list of meeting times
   * @returns The index of the next class date
   */
  function findNextClassDate() {
    return findNextClassDateIndex(values.meetingTimes)
  }

  /**
   * Record the class session by updating the status of the upcoming class in the class document
   * @param classId The ID of the class to update
   * @param link The link to the class session
   */
  const recordClass = async (classId: string) => {
    let {
      meetingLink,
      meetingTimes,
      feedbackCompleted,
      classStatuses,
      completedClassDates,
    } = values
    const confirmHoldClass = confirm(
      `Please confirm you are holding class now. Confirming will redirect you to ${meetingLink}`,
    )
    if (confirmHoldClass) {
      if (!classTodayHeld(completedClassDates))
        completedClassDates = [...completedClassDates, new Date()]
      let classToday = false
      if (
        nextClassIndex !== -1 &&
        nextClassIndex < meetingTimes.length &&
        new Date().toDateString() ===
          meetingTimes[nextClassIndex].toDateString()
      ) {
        classToday = true
        classStatuses[nextClassIndex] = feedbackCompleted[nextClassIndex]
          ? ClassStatus.EverythingComplete
          : ClassStatus.FeedbackIncomplete
      }
      if (!classToday) {
        alert.trigger(
          'error',
          'No class session found today! Please update your class schedule if you are planning to hold class today.',
        )
        return
      } else {
        await classService.recordClassSession(
          classId,
          completedClassDates,
          classStatuses,
        )
      }
      window.open(meetingLink)
    }
  }

  function sendSubRequest() {
    classService
      .submitSubRequest(
        classId,
        subRequestClassNumber,
        subRequestDate,
        subRequestNotes,
        values.course,
        values.instructorEmail,
        values.meetingLink,
      )
      .then(() => {
        alert.trigger('success', 'Sub request sent!')
        window.setTimeout(() => {
          location.reload()
        }, 1000)
      })
      .catch(() => {
        alert.trigger('error', 'Failed to send sub request, please try again.')
      })
  }

  function selectClass(newClassId: string) {
    selectedClassId = newClassId
    classId = newClassId
    values = instructorClasses[newClassId]
    studentList = [] // Reset student list

    let { students, meetingTimes } = values
    if (students) {
      getStudentList(students)
    }
    if (values && meetingTimes) {
      meetingTimes.sort((a, b) => {
        return a.getTime() - b.getTime()
      })
      originalMeetingTimes = meetingTimes.map((time: Date) =>
        toLocalISOString(time),
      )
      editedMeetingTimes = [...originalMeetingTimes]
      checkStatuses()
      nextClassIndex = findNextClassDate()
    }
  }

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        // Get all classes for this instructor using the DAL
        const userClasses = await classService.fetchInstructorClasses(
          user.object.uid,
          user.object.email || '',
        )

        // Convert to ClassDetails format and add id field
        const classDetails: { [classId: string]: Data.ClassDetails } = {}
        Object.entries(userClasses).forEach(([classId, classData]) => {
          classDetails[classId] = {
            id: classId,
            students: classData.students,
            classStatuses: classData.classStatuses,
            feedbackCompleted: classData.feedbackCompleted,
            instructorFirstName: classData.instructorFirstName,
            instructorLastName: classData.instructorLastName,
            instructorEmail: classData.instructorEmail,
            otherInstructorEmails: classData.otherInstructorEmails,
            course: classData.course,
            meetingLink: classData.meetingLink,
            meetingTimes: classData.meetingTimes,
            completedClassDates: classData.completedClassDates,
          }
        })

        instructorClasses = classDetails
        availableClassIds = Object.keys(instructorClasses).sort()

        // Auto-select first class if available
        if (availableClassIds.length > 0) {
          selectClass(availableClassIds[0])
        }
      }
    })
  })
</script>

<Dialog bind:open={showEmailDialog} size="min">
  {#snippet title()}
    Please notify your student's parents about your class time changes
  {/snippet}

  {#snippet description()}
    <div class="space-y-4">
      <p>
        Here is an email template you can copy to send to your students'
        parents.
      </p>
      <div class="mt-5 flex justify-end">
        <Button
          onclick={() => copyToClipboard(emailHtmlContent)}
          class="flex items-center gap-1"
        >
          <svg
            fill="#000000"
            height="20"
            width="20"
            version="1.1"
            id="Capa_1"
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 352.804 352.804"
            xml:space="preserve"
          >
            <g>
              <path
                d="M318.54,57.282h-47.652V15c0-8.284-6.716-15-15-15H34.264c-8.284,0-15,6.716-15,15v265.522c0,8.284,6.716,15,15,15h47.651
         v42.281c0,8.284,6.716,15,15,15H318.54c8.284,0,15-6.716,15-15V72.282C333.54,63.998,326.824,57.282,318.54,57.282z
          M49.264,265.522V30h191.623v27.282H96.916c-8.284,0-15,6.716-15,15v193.24H49.264z M303.54,322.804H111.916V87.282H303.54V322.804
         z"
              />
            </g>
          </svg>
          <span>Copy</span>
        </Button>
      </div>
      {@html emailHtmlContent}

      <DialogActions>
        <Button
          onclick={() => {
            showEmailDialog = false
            location.reload()
          }}>Close</Button
        >
      </DialogActions>
    </div>
  {/snippet}
</Dialog>
<Dialog bind:open={showFeedbackDialog} size="min" alert>
  {#snippet title()}
    <div class="flex items-center justify-between">
      Weekly {values.course} Class Feedback Form <Button
        color="red"
        class="font-light"
        onclick={() => (showFeedbackDialog = false)}>Close</Button
      >
    </div>
  {/snippet}
  {#snippet description()}
    <div>
      <InstructorFeedbackForm
        classBeingSubbed={undefined}
        sessionNumber={nextClassIndex + 1}
        {classId}
      />
    </div>
  {/snippet}
</Dialog>
<ClassDetailsForm
  bind:open={showClassDetailsDialog}
  dialog={true}
  {semesterDates}
/>

<div class="p-0">
  <Dialog bind:open={showStudentListDialog} size="full">
    {#snippet title()}
      <div class="flex items-center justify-between">
        Class List <Button
          color="red"
          class="font-light"
          onclick={() => (showStudentListDialog = false)}>Close</Button
        >
      </div>
    {/snippet}
    {#snippet description()}
      <Card class="mb-4">
        <div class="mb-4 flex items-center justify-end">
          <Button
            onclick={() =>
              copyEmails(
                studentList.flatMap((student) => [
                  student.email,
                  student.secondaryEmail,
                ]),
              )}
            class="flex items-center justify-end gap-1"
          >
            <svg
              fill="#000000"
              height="20"
              width="20"
              version="1.1"
              id="Capa_1"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              viewBox="0 0 352.804 352.804"
              xml:space="preserve"
            >
              <g>
                <path
                  d="M318.54,57.282h-47.652V15c0-8.284-6.716-15-15-15H34.264c-8.284,0-15,6.716-15,15v265.522c0,8.284,6.716,15,15,15h47.651
       v42.281c0,8.284,6.716,15,15,15H318.54c8.284,0,15-6.716,15-15V72.282C333.54,63.998,326.824,57.282,318.54,57.282z
        M49.264,265.522V30h191.623v27.282H96.916c-8.284,0-15,6.716-15,15v193.24H49.264z M303.54,322.804H111.916V87.282H303.54V322.804
       z"
                />
              </g>
            </svg>
            <span>Copy</span>
          </Button>
        </div>
        <div style="overflow: auto;">
          <table style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr>
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                  >Student Name</th
                >
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                  >Email</th
                >
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                  >Secondary Email</th
                >
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                  >Phone</th
                >
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                  >Grade</th
                >
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                  >School</th
                >
                <th
                  style="white-space: nowrap; border-bottom: 1px solid #ccc; padding: 8px;"
                ></th>
              </tr>
            </thead>
            <tbody>
              {#each studentList as student (student.email)}
                <tr style="border-bottom: 1px solid #ccc;">
                  <td style="padding: 8px;"
                    >{normalizeCapitals(student.name)}</td
                  >
                  <td style="padding: 8px;">{student.email}</td>
                  <td style="padding: 8px;">{student.secondaryEmail}</td>
                  <td style="padding: 8px;">{student.phone}</td>
                  <td style="padding: 8px;">{student.grade}</td>
                  <td style="padding: 8px;">{student.school}</td>
                  <td
                    ><Button
                      color="blue"
                      onclick={() =>
                        sendClassReminder({
                          studentList,
                          studentName: normalizeCapitals(student.name),
                          studentEmail: student.email,
                          instructorName:
                            values.instructorFirstName +
                            ' ' +
                            values.instructorLastName,
                          otherInstructorEmails: values.otherInstructorEmails,
                          className: values.course,
                          nextMeetingTime:
                            nextClassIndex === -1
                              ? 'No Upcoming Classes'
                              : values.course +
                                ', ' +
                                formatDateString(
                                  editedMeetingTimes[nextClassIndex],
                                ),
                        })}
                      ><svg
                        width="16px"
                        height="16px"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path
                          d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                        ></path><polyline points="22,6 12,13 2,6"
                        ></polyline></svg
                      ></Button
                    ></td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    {/snippet}
  </Dialog>
  <!-- Class Selector -->
  {#if availableClassIds.length > 1}
    <Card class="mb-4">
      <h3 class="mb-3 text-lg font-semibold">Select Class</h3>
      <div class="flex flex-wrap gap-2">
        {#each availableClassIds as classId (classId)}
          <Button
            color={selectedClassId === classId ? 'blue' : 'gray'}
            onclick={() => selectClass(classId)}
          >
            Class {classId.split('-')[1]}
            {#if instructorClasses[classId]?.course}
              - {instructorClasses[classId].course}
            {/if}
          </Button>
        {/each}
      </div>
    </Card>
  {/if}

  {#if values.id !== ''}
    <Card class="mb-4">
      <div class="font-bold">Next Upcoming Class:</div>
      <div>
        {nextClassIndex === -1
          ? 'No Upcoming Classes'
          : values.course +
            ', ' +
            formatDateString(editedMeetingTimes[nextClassIndex])}
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button
          color="blue"
          onclick={() =>
            window.open(`${generateCurriculumLink(values.course)}`, '_blank')}
          >Curriculum</Button
        >
        <Button
          color="blue"
          onclick={() => {
            recordClass(classId)
          }}>Join Class</Button
        >
        <Button
          color="blue"
          onclick={() =>
            sendClassReminder({
              studentList,
              instructorName: values.instructorFirstName,
              otherInstructorEmails: values.otherInstructorEmails,
              className: values.course,
              nextMeetingTime:
                nextClassIndex === -1
                  ? 'No Upcoming Classes'
                  : values.course +
                    ', ' +
                    formatDateString(editedMeetingTimes[nextClassIndex]),
            })}>Send Reminder</Button
        >
        <Button color="blue" onclick={() => (showFeedbackDialog = true)}
          >Submit Feedback</Button
        >
        <Button color="blue" onclick={() => (showClassDetailsDialog = true)}
          >Class Details</Button
        >
        <Button color="blue" onclick={() => (showStudentListDialog = true)}
          >View Student List</Button
        >
      </div>
    </Card>

    <div class="mb-4 flex flex-wrap justify-between gap-2">
      <Button
        color="blue"
        class={`${editMode ? 'hidden' : ''}`}
        onclick={() => (editMode = true)}>Edit Schedule</Button
      >
      <Button
        color="green"
        class={`${editMode ? 'hidden' : ''}`}
        onclick={() => (addingClass = true)}>Add Class to Schedule</Button
      >

      <Dialog bind:open={addingClass} size="min">
        {#snippet title()}
          Add Class to Schedule
        {/snippet}

        {#snippet description()}
          <div class="space-y-4">
            <p>
              Please enter the date and time of the class you would like to add.
            </p>

            <Input
              type="datetime-local"
              class="rounded-sm border p-1"
              bind:value={classToBeAdded}
            />
            <Button
              color="green"
              onclick={() => {
                editedMeetingTimes.push(classToBeAdded)
                editedMeetingTimes = editedMeetingTimes.slice()
                saveChanges()
                addingClass = false
              }}>Add Class</Button
            >
            <DialogActions>
              <Button onclick={() => (addingClass = false)}>Close</Button>
            </DialogActions>
          </div>
        {/snippet}
      </Dialog>

      {#if editMode}
        <Button color="red" onclick={cancelChanges}>Cancel Changes</Button>
        <Button color="green" onclick={saveChanges}>Save Changes</Button>
      {/if}
    </div>
  {:else}
    <Card>
      <div class="mb-2 font-bold">
        Fill out the class details form to get your schedule!
      </div>
    </Card>
  {/if}
  <ul class="list-none space-y-4">
    {#each editedMeetingTimes as classTime, classNumber (classTime)}
      <li
        class="relative flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-lg"
      >
        <div class="flex min-w-50 flex-1 items-center gap-4">
          <!-- Status badge -->
          {#if values.classStatuses[classNumber] === ClassStatus.ClassNotHeld}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                /></svg
              >
              Not Held
            </span>
          {:else if values.classStatuses[classNumber] === ClassStatus.FeedbackIncomplete}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3"
                /></svg
              >
              Feedback Needed
            </span>
          {:else if values.classStatuses[classNumber] === ClassStatus.ClassUpcomingSoon}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="2"
                  fill="none"
                /><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6v6l4 2"
                /></svg
              >
              Upcoming
            </span>
          {:else if values.classStatuses[classNumber] === ClassStatus.EverythingComplete}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                /></svg
              >
              Complete
            </span>
          {:else}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="2"
                  fill="none"
                /></svg
              >
              Scheduled
            </span>
          {/if}
          <div class="flex min-w-0 flex-col">
            <span class="text-lg font-semibold"
              >Class {classNumber + 1}: {values.course}</span
            >
            <span class="text-sm text-gray-600"
              >{formatDateString(classTime)}</span
            >
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          {#if editMode}
            <Input
              type="datetime-local"
              class={{ container: 'mt-0', input: 'h-10 rounded-sm border p-1' }}
              bind:value={editedMeetingTimes[classNumber]}
            />
            <Button
              color="red"
              onclick={() => {
                editedMeetingTimes.splice(classNumber, 1)
                editedMeetingTimes = editedMeetingTimes.slice()
              }}
            >
              <svg
                class="mr-1 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                /></svg
              >
              Delete
            </Button>
          {:else}
            {#if values.classStatuses[classNumber] !== ClassStatus.ClassNotHeld && values.classStatuses[classNumber] !== ClassStatus.FeedbackIncomplete && values.classStatuses[classNumber] !== ClassStatus.ClassUpcomingSoon && values.classStatuses[classNumber] !== ClassStatus.EverythingComplete}
              <Button
                color="blue"
                onclick={() => {
                  subRequestDate = classTime
                  subRequestClassNumber = classNumber + 1
                  subRequestNotes = ''
                  showSubRequestDialog = true
                }}
              >
                <svg
                  class="mr-1 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4v16m8-8H4"
                  /></svg
                >
                Request Sub
              </Button>
            {/if}
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  <!-- Sub Request Dialog (restored, available for all sessions) -->
  <Dialog bind:open={showSubRequestDialog} size="min">
    {#snippet title()}
      <div class="flex items-center justify-between">
        Submit A Sub Request
        <DialogActions>
          <Button onclick={() => (showSubRequestDialog = false)} color="red"
            >Close</Button
          >
        </DialogActions>
      </div>
    {/snippet}
    {#snippet description()}
      <div class="space-y-4">
        <Input
          type="number"
          class="rounded-sm border p-1"
          bind:value={subRequestClassNumber}
          label="Please confirm the class number ."
        />
        <Input
          type="datetime-local"
          class="rounded-sm border p-1"
          bind:value={subRequestDate}
          label="Please confirm the date and time of the class you would like to request a sub for."
        />
        <Input
          type="text"
          class="rounded-sm border p-1"
          bind:value={subRequestNotes}
          label="Please describe what topic/lesson the substitute class will cover, and any helpful notes for the substitute instructor."
        />
        <Button
          color="green"
          onclick={() => {
            sendSubRequest()
            showSubRequestDialog = false
          }}>Confirm Request</Button
        >
      </div>
    {/snippet}
  </Dialog>
</div>

<style>
  /* Add any additional styles here */
</style>
