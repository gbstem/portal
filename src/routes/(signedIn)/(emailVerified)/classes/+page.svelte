<script lang="ts">
  import { user } from '$lib/client/firebase'
  import Button from '$lib/components/Button.svelte'
  import Card from '$lib/components/Card.svelte'
  import Dialog from '$lib/components/Dialog.svelte'
  import DialogActions from '$lib/components/DialogActions.svelte'
  import Link from '$lib/components/Link.svelte'
  import Loading from '$lib/components/Loading.svelte'
  import Select from '$lib/components/Select.svelte'
  import StudentSelect from '$lib/components/StudentSelect.svelte'
  import { coursesJson } from '$lib/data'
  import { semesterDates } from '$lib/data/collections'
  import { classService } from '$lib/services/classService'
  import { registrationService } from '$lib/services/registrationService'
  import { alert } from '$lib/stores'
  import { formatClassTimes } from '$lib/utils'
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'

  import {
    buildPortalEnrollApiPayload,
    isGradeEligible,
    type ClassInfo,
  } from '$lib/helpers/classesPage'

  let classes: ClassInfo[] = $state([])
  let loading = $state(true)
  let showClassDetailsDialog = $state(false)
  let dialogClassDetails: ClassInfo | null = $state(null)
  let selectedStudentUid = $state('')
  let userName = ''

  let classFilter = $state('')
  let onlyShowEnrolled = $state(false)

  const studentUidToClassIds: {
    [studentUid: string]: string[]
  } = $state({})

  const studentUidToGrade: Record<string, string> = {}

  const uidToName: Record<string, string> = $state({})

  // Preload student data for the StudentSelect component
  let preloadedStudents: { uid: string; name: string }[] = []

  let isStudent = $state(true)

  const determineStudentEnrollment = async (user: Data.User.Store) => {
    const uid = user.object.uid
    const slots = await registrationService.fetchChildRegistrationSlots(uid)
    slots.forEach((slot, index) => {
      if (slot.exists && slot.data?.meta.submitted) {
        const studentUid = slot.uid
        const studentClassIds = slot.data.classes ?? []
        studentUidToClassIds[studentUid] = studentClassIds
        const name =
          `${slot.data.personal.studentFirstName} ${slot.data.personal.studentLastName}`.trim() ||
          `Child ${index + 1}`
        uidToName[studentUid] = name
        studentUidToGrade[studentUid] = slot.data.academic.grade ?? ''

        // Add to preloaded students for StudentSelect component
        preloadedStudents.push({
          uid: studentUid,
          name: name,
        })
      }
    })
  }

  const getData = () => {
    return user.subscribe(async (user) => {
      // `loading` is cleared in `finally` so a failed read leaves the page in an
      // error state the user can act on rather than a spinner that never stops.
      try {
        if (user?.profile.role === 'instructor') {
          isStudent = false
        }
        classes = await classService.fetchAllClassesInfo()

        if (user && isStudent) {
          // Enrollment loading used to be gated on `object.displayName` being
          // truthy, standing in for "the profile is loaded". A parent whose
          // displayName was blank silently got no children and no error.
          userName = user.profile.firstName ?? ''
          await determineStudentEnrollment(user)
        }
      } catch (err) {
        console.error('[classes] Failed to load class data:', err)
        alert.trigger(
          'error',
          'Could not load classes. Please reload the page to try again.',
        )
      } finally {
        loading = false
      }
    })
  }

  onMount(() => {
    getData()
  })

  const isEnrolled = (classId: string, studentUid: string): boolean => {
    if (!studentUid || !studentUidToClassIds[studentUid]) {
      return false
    }
    return studentUidToClassIds[studentUid].includes(classId)
  }

  const toggleEnrollment = async (classId: string) => {
    if (selectedStudentUid === '') {
      alert.trigger('error', 'Please select a child!')
      return
    }
    if (isEnrolled(classId, selectedStudentUid)) {
      await unenrollFromClass(classId)
    } else {
      await enrollInClass(classId)
    }
    getData()
  }

  async function enrollInClass(classId: string): Promise<void> {
    if (selectedStudentUid === '') {
      alert.trigger('error', 'Please select a child!')
      return
    }
    // get updated number of students in the class
    const { numStudents, classCap } =
      await classService.fetchClassCapacityInfo(classId)
    if (numStudents >= classCap) {
      alert.trigger('error', 'Class is full!')
      return
    }

    // throw alert if student attempts to enroll in more than 2 classes
    if ((studentUidToClassIds[selectedStudentUid]?.length ?? 0) >= 2) {
      alert.trigger(
        'error',
        'Each student may only enroll in a maximum of 2 classes!',
      )
      return
    }

    const ageBypassEnabled =
      await classService.fetchBypassAgeLimits(selectedStudentUid)

    if (dialogClassDetails) {
      const eligibility = isGradeEligible(
        dialogClassDetails.course,
        studentUidToGrade[selectedStudentUid],
        ageBypassEnabled,
      )
      if (!eligibility.eligible) {
        alert.trigger(
          'error',
          `Students must be in grade ${eligibility.requiredGrade} or higher to enroll in this class!`,
        )
        return
      }
    }

    await classService
      .enrollStudentInClass(classId, selectedStudentUid)
      .catch((error) => {
        console.error('Class enrollment error:', error)
        alert.trigger('error', 'Error enrolling in class!')
      })

    await classService
      .confirmStudentClassEnrollment(selectedStudentUid, classId)
      .then(() => {
        alert.trigger('success', 'Enrolled in class!')
        if (!dialogClassDetails) return
        const payload = buildPortalEnrollApiPayload(
          userName,
          dialogClassDetails,
          uidToName[selectedStudentUid],
        )
        fetch('/api/enroll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }).then(async (res) => {
          if (!res.ok) {
            const { message } = await res.json()
            console.error('Enrollment API error:', message)
          }
          showClassDetailsDialog = false
          window.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
        })
        alert.trigger(
          'success',
          'Thank you for enrolling! You will receive an email confirming course details shortly.',
        )
      })
      .catch((error) => {
        console.error('Registration enrollment error:', error)
        alert.trigger('error', 'Error enrolling in class!')
      })
  }

  function clearFilter() {
    classFilter = ''
  }

  function clearEnrolled() {
    clearFilter()
    onlyShowEnrolled = !onlyShowEnrolled
  }

  async function unenrollFromClass(classId: string): Promise<void> {
    await classService
      .unenrollStudentFromClass(classId, selectedStudentUid)
      .catch((error) => {
        console.error('Class unenrollment error:', error)
        alert.trigger('error', 'Error unenrolling from class!')
      })

    await classService
      .confirmStudentClassUnenrollment(selectedStudentUid, classId)
      .then(() => {
        alert.trigger('success', 'Unenrolled from class!')
        showClassDetailsDialog = false
      })
      .catch((error) => {
        console.error('Registration unenrollment error:', error)
        alert.trigger('error', 'Error unenrolling from class!')
      })
  }
</script>

<svelte:head>
  <title>Classes Overview</title>
</svelte:head>

<Dialog bind:open={showClassDetailsDialog} size="min">
  {#snippet title()}
    Class Details
  {/snippet}

  {#snippet description()}
    <div class="space-y-6 p-6">
      <!-- Hidden focusable element to prevent auto-focus on StudentSelect -->
      <button
        type="button"
        tabindex="0"
        aria-label="hidden focus catch"
        style="position: absolute; left: -9999px; width: 1px; height: 1px;"
      ></button>
      {#if dialogClassDetails !== null}
        <!-- Status Badge -->
        <div class="flex justify-end">
          <span
            class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white shadow-xs {dialogClassDetails.spotsRemaining <=
            0
              ? 'bg-red-500'
              : 'bg-green-500'}"
          >
            {#if dialogClassDetails.spotsRemaining <= 0}
              <svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clip-rule="evenodd"
                />
              </svg>
              Class Full
            {:else}
              <svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
              {dialogClassDetails.spotsRemaining} spots available
            {/if}
          </span>
        </div>

        <!-- Course Header -->
        <div class="border-b border-gray-200 pb-4">
          <h2 class="text-2xl font-bold text-gray-900">
            {dialogClassDetails.course}
            {#if dialogClassDetails.gradeRecommendation}
              <span class="ml-2 text-lg font-medium text-gray-500">
                (Grades {dialogClassDetails.gradeRecommendation})
              </span>
            {/if}
          </h2>
        </div>

        <!-- Class Details Grid -->
        <div class="grid gap-4">
          <!-- Class Type & Instructor -->
          <div class="space-y-3">
            <div class="flex items-center rounded-lg bg-gray-50 p-3">
              <svg
                class="mr-3 h-5 w-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {#if dialogClassDetails.online}
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                {:else}
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                {/if}
              </svg>
              <div>
                <div class="font-semibold text-gray-900">
                  {dialogClassDetails.online
                    ? 'Online Class'
                    : 'In-Person Class'}
                </div>
                <div class="text-sm text-gray-600">
                  {dialogClassDetails.online
                    ? 'Virtual classroom'
                    : 'Cambridge Public Library Main Branch'}
                </div>
              </div>
            </div>

            <div class="flex items-center rounded-lg bg-gray-50 p-3">
              <svg
                class="mr-3 h-5 w-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <div>
                <div class="font-semibold text-gray-900">Instructor</div>
                <div class="text-sm text-gray-600">
                  {`${dialogClassDetails.instructorFirstName} ${dialogClassDetails.instructorLastName}`}
                </div>
              </div>
            </div>
          </div>

          <!-- Class Times -->
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4
              class="mb-3 flex items-center text-lg font-semibold text-blue-900"
            >
              <svg
                class="mr-2 h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Class Schedule ({dialogClassDetails.online
                ? '1-hour classes'
                : '2-hour class'})
            </h4>
            <div class="space-y-2">
              {#each formatClassTimes(dialogClassDetails.classDays, dialogClassDetails.classTimes) as classTime (classTime)}
                <div class="flex items-center text-blue-800">
                  <svg
                    class="mr-3 h-4 w-4 text-blue-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l2.293 2.293a1 1 0 001.414-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span class="font-medium">{classTime}</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Enrollment Section -->
          {#if isStudent}
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4
                class="mb-3 flex items-center text-lg font-semibold text-gray-900"
              >
                <svg
                  class="mr-2 h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Enrollment
              </h4>
              <div class="space-y-3">
                <div>
                  <StudentSelect bind:selectedStudentUid {preloadedStudents} />
                </div>
                <Button
                  class="flex w-full items-center justify-center gap-2"
                  color={isEnrolled(dialogClassDetails.id, selectedStudentUid)
                    ? 'red'
                    : 'blue'}
                  onclick={() => {
                    if (dialogClassDetails) {
                      toggleEnrollment(dialogClassDetails.id)
                    }
                  }}
                >
                  <svg
                    class="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {#if isEnrolled(dialogClassDetails.id, selectedStudentUid)}
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    {:else}
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    {/if}
                  </svg>
                  {isEnrolled(dialogClassDetails.id, selectedStudentUid)
                    ? 'Unenroll Student'
                    : 'Enroll Student'}
                </Button>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <DialogActions>
        <Button onclick={() => (showClassDetailsDialog = false)}>Close</Button>
      </DialogActions>
    </div>
  {/snippet}
</Dialog>

<div>
  {#if loading}
    <Loading />
  {:else if new Date() < new Date(semesterDates.registrationsDue)}
    <div class="rounded-lg bg-red-50 p-4 text-2xl text-red-700">
      <p>
        {`Class enrollment is not open yet. Class times will be posted and class enrollment will open on ${semesterDates.registrationsDue}.`}
      </p>
      <p>
        Before then, ensure you have filled out the form for each student you
        wish to enroll this semester, <Link href="/apply">here</Link>. This is a
        mandatory step; without it, you will not be able to enroll your student
        when classes are posted. You will be notified by email when enrollment
        opens.
      </p>
    </div>
  {:else}
    <div class="mb-5 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Select
          bind:value={classFilter}
          placeholder="Filter by course"
          options={[{ name: 'all' }, ...coursesJson]}
        />
      </div>
      {#if isStudent}
        <Button
          color={onlyShowEnrolled ? 'blue' : 'gray'}
          onclick={() => clearEnrolled()}
        >
          {onlyShowEnrolled ? 'Show all classes' : 'Show all enrolled classes'}
        </Button>
      {/if}
    </div>

    <div class="grid gap-6 md:grid-cols-2" transition:fade={{ duration: 500 }}>
      {#each classes as classInfo (classInfo.id)}
        {#if classFilter == '' || classFilter == 'all' || classFilter == classInfo.course}
          {#if !onlyShowEnrolled || Object.entries(studentUidToClassIds).some( ([, classIds]) => classIds.includes(classInfo.id) )}
            <Card
              class="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-xs transition-all duration-200 hover:border-gray-300 hover:shadow-lg"
            >
              <!-- Course Header & Status Badge -->
              <div class="mb-4 flex items-start justify-between gap-4">
                <h2
                  class="text-xl font-bold text-gray-900 transition-colors group-hover:text-blue-600"
                >
                  {classInfo.course}
                  {#if classInfo.gradeRecommendation}
                    <span class="ml-2 text-sm font-medium text-gray-500">
                      (Grades {classInfo.gradeRecommendation})
                    </span>
                  {/if}
                </h2>
                <div class="shrink-0">
                  <span
                    class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white shadow-xs {classInfo.spotsRemaining <=
                    0
                      ? 'bg-red-500'
                      : 'bg-green-500'}"
                  >
                    {#if classInfo.spotsRemaining <= 0}
                      <svg
                        class="mr-1 h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      Class Full
                    {:else}
                      <svg
                        class="mr-1 h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      {classInfo.spotsRemaining} spots
                    {/if}
                  </span>
                </div>
              </div>

              <!-- Class Type & Instructor -->
              <div class="mb-4 space-y-2">
                <div class="flex items-center text-sm text-gray-600">
                  <svg
                    class="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {#if classInfo.online}
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    {:else}
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    {/if}
                  </svg>
                  {classInfo.online
                    ? 'Online Class'
                    : 'In-Person (Cambridge Public Library)'}
                </div>
                <div class="flex items-center text-sm text-gray-600">
                  <svg
                    class="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  {`${classInfo.instructorFirstName} ${classInfo.instructorLastName}`}
                </div>
              </div>

              <!-- Class Times -->
              <div class="mb-4">
                <h4
                  class="mb-2 flex items-center text-sm font-semibold text-gray-700"
                >
                  <svg
                    class="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Class Times ({classInfo.online
                    ? '1-hour classes'
                    : '2-hour class'})
                </h4>
                <div class="space-y-1">
                  {#each formatClassTimes(classInfo.classDays, classInfo.classTimes) as classTime (classTime)}
                    <div class="flex items-center text-sm text-gray-600">
                      <svg
                        class="mr-2 h-3 w-3 text-gray-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l2.293 2.293a1 1 0 001.414-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      {classTime}
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Enrolled Students Section -->
              {#if Object.entries(studentUidToClassIds).some( ([, classIds]) => classIds.includes(classInfo.id) )}
                <div
                  class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3"
                >
                  <h4
                    class="mb-2 flex items-center text-sm font-semibold text-blue-800"
                  >
                    <svg
                      class="mr-2 h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                      />
                    </svg>
                    Your Enrolled Students
                  </h4>
                  <div class="space-y-1">
                    {#each Object.entries(studentUidToClassIds) as [studentUid, classIds] (studentUid)}
                      {#if classIds.includes(classInfo.id)}
                        <div class="flex items-center text-sm text-blue-700">
                          <svg
                            class="mr-2 h-3 w-3"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {uidToName[studentUid]}
                        </div>
                      {/if}
                    {/each}
                  </div>

                  <!-- Meeting Link -->
                  <div class="mt-3 border-t border-blue-200 pt-3">
                    <div class="flex items-center text-sm text-blue-700">
                      <svg
                        class="mr-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9"
                        />
                      </svg>
                      <a
                        href={classInfo.meetingLink}
                        target="_blank"
                        rel="noopener"
                        class="hover:underline"
                      >
                        Join Meeting
                      </a>
                    </div>

                    <!-- Instructor Email -->
                    <div class="mt-1 flex items-center text-sm text-blue-700">
                      <svg
                        class="mr-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      <a
                        href={`mailto:${classInfo.instructorEmail}`}
                        target="_blank"
                        rel="noopener"
                        class="hover:underline"
                      >
                        Contact Instructor
                      </a>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Action Button -->
              {#if isStudent}
                <div class="mt-4">
                  <Button
                    class="flex w-full items-center justify-center gap-2"
                    color="blue"
                    onclick={() => {
                      dialogClassDetails = classInfo
                      showClassDetailsDialog = true
                    }}
                  >
                    <svg
                      class="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    Add/Drop Class
                  </Button>
                </div>
              {/if}
            </Card>
          {/if}
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Add your styles here */
</style>
