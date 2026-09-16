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
  import { curriculumLink } from '$lib/helpers/curriculumLink'
  import type { RosterStudent } from '$lib/services/classService'
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
  import DateTimeInput from './DateTimeInput.svelte'
  import NumberInput from './NumberInput.svelte'
  import TextInput from './TextInput.svelte'
  import ClassDetailsForm from './forms/ClassDetailsForm.svelte'
  import InstructorFeedbackForm from './forms/InstructorFeedbackForm.svelte'
  import { ClassStatus } from './helpers/ClassStatus'
  import sendClassReminder from './helpers/sendClassReminder'
  import { Icon } from '@steeze-ui/svelte-icon'
  import {
    Check,
    Clock,
    DocumentDuplicate,
    Envelope,
    Plus,
    XMark,
  } from '@steeze-ui/heroicons'
  import CircleIcon from '$lib/components/icons/CircleIcon.svelte'

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
    instructorUid: '',
    otherInstructorUids: [],
    course: '',
    meetingLink: '',
    meetingTimes: [],
    completedClassDates: [],
  })

  // null when this class's course has no page on the curriculum site, which
  // hides the button rather than opening a URL that would 404.
  const courseCurriculumLink = $derived(curriculumLink(values.course))

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
  let studentList: RosterStudent[] = $state([])
  let addingClass = $state(false)

  let classToBeAdded = $state('')
  let subRequestDate: string = $state('')
  let subRequestClassNumber: number = $state(0)
  let subRequestNotes: string = $state('')

  /**
   * Fetches student roster for the active class via the backend API.
   * @param targetClassId
   */
  const getStudentList = async (targetClassId: string) => {
    try {
      const fetchedStudents = await classService.fetchClassRoster(targetClassId)
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
        values.meetingLink,
        values.instructorUid,
        // Whoever is signed in, which for a co-taught class need not be the
        // instructor the class document names.
        $user?.object.uid,
      )
      .then(() => {
        alert.trigger('success', 'Sub request sent!')
        window.setTimeout(() => {
          location.reload()
        }, 1000)
      })
      .catch((err) => {
        // A session's request is a single document, so filing again for a
        // session that already has one is refused rather than overwriting it
        // - and whoever may already be covering it.
        alert.trigger(
          'error',
          err?.code === 'permission-denied'
            ? "That session already has a sub request, so it wasn't filed again."
            : 'Failed to send sub request, please try again.',
        )
      })
  }

  function selectClass(newClassId: string) {
    selectedClassId = newClassId
    classId = newClassId
    values = instructorClasses[newClassId]
    studentList = [] // Reset student list

    if (newClassId) {
      getStudentList(newClassId)
    }
    let { meetingTimes } = values
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
        const userClasses = await classService.fetchInstructorClasses()

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
            instructorUid: classData.instructorUid,
            otherInstructorUids: classData.otherInstructorUids,
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
          <Icon src={DocumentDuplicate} class="h-5 w-5 text-black" />
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
        subRequest={undefined}
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
            <Icon src={DocumentDuplicate} class="h-5 w-5 text-black" />
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
              {#each studentList as student (student.uid)}
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
                          classId,
                          studentUid: student.uid,
                          studentName: normalizeCapitals(student.name),
                          nextMeetingTime:
                            nextClassIndex === -1
                              ? 'No Upcoming Classes'
                              : values.course +
                                ', ' +
                                formatDateString(
                                  editedMeetingTimes[nextClassIndex],
                                ),
                        })}><Icon src={Envelope} class="h-4 w-4" /></Button
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
        {#if courseCurriculumLink}
          <Button
            color="blue"
            onclick={() => window.open(courseCurriculumLink, '_blank')}
            >Curriculum</Button
          >
        {/if}
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
              classId,
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

            <DateTimeInput
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
              <Icon src={XMark} class="h-4 w-4" />
              Not Held
            </span>
          {:else if values.classStatuses[classNumber] === ClassStatus.FeedbackIncomplete}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800"
            >
              <Icon src={Clock} class="h-4 w-4" />
              Feedback Needed
            </span>
          {:else if values.classStatuses[classNumber] === ClassStatus.ClassUpcomingSoon}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800"
            >
              <Icon src={Clock} class="h-4 w-4" />
              Upcoming
            </span>
          {:else if values.classStatuses[classNumber] === ClassStatus.EverythingComplete}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
            >
              <Icon src={Check} class="h-4 w-4" />
              Complete
            </span>
          {:else}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
            >
              <CircleIcon class="h-4 w-4" />
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
            <DateTimeInput
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
              <Icon src={XMark} class="mr-1 h-4 w-4" />
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
                <Icon src={Plus} class="mr-1 h-4 w-4" />
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
        <NumberInput
          class="rounded-sm border p-1"
          bind:value={subRequestClassNumber}
          label="Please confirm the class number ."
        />
        <DateTimeInput
          class="rounded-sm border p-1"
          bind:value={subRequestDate}
          label="Please confirm the date and time of the class you would like to request a sub for."
        />
        <TextInput
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
