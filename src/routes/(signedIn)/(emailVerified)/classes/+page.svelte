<script lang="ts">
  import { page } from '$app/state'
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

  import type { ClassInfo } from '$lib/helpers/classesPage'
  import { Icon } from '@steeze-ui/svelte-icon'
  import {
    ArrowUpCircle,
    BuildingOffice,
    CheckCircle,
    Clock,
    ComputerDesktop,
    Envelope,
    GlobeAlt,
    Plus,
    Trash,
    User,
    Users,
    XCircle,
  } from '@steeze-ui/heroicons'

  let classes: ClassInfo[] = $state([])
  let loading = $state(true)
  let showClassDetailsDialog = $state(false)
  let dialogClassDetails: ClassInfo | null = $state(null)
  let selectedStudentUid = $state('')

  let classFilter = $state('')
  let onlyShowEnrolled = $state(false)

  const studentUidToClassIds: {
    [studentUid: string]: string[]
  } = $state({})

  const uidToName: Record<string, string> = $state({})

  // classId -> the instructor's current address, for "Contact Instructor".
  const instructorEmails: Record<string, string> = $state({})

  // Preload student data for the StudentSelect component
  let preloadedStudents: { uid: string; name: string }[] = []

  const isStudent = $derived(page.data.user?.role === 'student')

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

        // Add to preloaded students for StudentSelect component
        preloadedStudents.push({
          uid: studentUid,
          name: name,
        })
      }
    })
  }

  // Resolved from each enrolled class's instructorUid, never read off the class
  // document: the stored copy goes stale when the instructor changes their
  // account email, and `--strip-emails` removes it. A uid that names no
  // account gets no link. The server resolves it only for a class one of this
  // parent's students is on, which is also the only card showing the link.
  const loadInstructorEmails = async () => {
    const enrolledClassIds = new Set(Object.values(studentUidToClassIds).flat())
    await Promise.all(
      classes.map(async ({ id, instructorUid }) => {
        if (!instructorUid || !enrolledClassIds.has(id)) return
        if (id in instructorEmails) return
        try {
          const email = await classService.fetchEnrolledClassInstructorEmail(
            id,
            instructorUid,
          )
          if (email) instructorEmails[id] = email
        } catch (err) {
          console.error(
            `[classes] Could not resolve the instructor address for ${id}:`,
            err,
          )
        }
      }),
    )
  }

  const getData = () => {
    return user.subscribe(async (user) => {
      // `loading` is cleared in `finally` so a failed read leaves the page in an
      // error state the user can act on rather than a spinner that never stops.
      try {
        classes = await classService.fetchAllClassesInfo()

        if (user && isStudent) {
          // Enrollment loading used to be gated on `object.displayName` being
          // truthy, standing in for "the profile is loaded". A parent whose
          // displayName was blank silently got no children and no error.
          await determineStudentEnrollment(user)
          // Not awaited: the cards needn't wait on their contact links.
          void loadInstructorEmails()
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

  // Capacity, the two-class limit and grade eligibility are all checked by
  // /api/enroll, which writes the class roster and the registration together;
  // its refusal message is what's shown.
  async function enrollInClass(classId: string): Promise<void> {
    try {
      const { emailSent } = await classService.enrollStudent(
        classId,
        selectedStudentUid,
      )
      alert.trigger(
        'success',
        emailSent
          ? 'Thank you for enrolling! You will receive an email confirming course details shortly.'
          : 'Enrolled in class!',
      )
      showClassDetailsDialog = false
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error('Class enrollment error:', error)
      alert.trigger(
        'error',
        error instanceof Error ? error.message : 'Error enrolling in class!',
      )
    }
  }

  function clearFilter() {
    classFilter = ''
  }

  function clearEnrolled() {
    clearFilter()
    onlyShowEnrolled = !onlyShowEnrolled
  }

  async function unenrollFromClass(classId: string): Promise<void> {
    try {
      await classService.unenrollStudent(classId, selectedStudentUid)
      alert.trigger('success', 'Unenrolled from class!')
      showClassDetailsDialog = false
    } catch (error) {
      console.error('Class unenrollment error:', error)
      alert.trigger(
        'error',
        error instanceof Error
          ? error.message
          : 'Error unenrolling from class!',
      )
    }
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
              <Icon src={XCircle} theme="mini" class="mr-2 h-4 w-4" />
              Class Full
            {:else}
              <Icon src={CheckCircle} theme="mini" class="mr-2 h-4 w-4" />
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
              <Icon
                src={dialogClassDetails.online
                  ? ComputerDesktop
                  : BuildingOffice}
                class="mr-3 h-5 w-5 text-gray-600"
              />
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
              <Icon src={User} class="mr-3 h-5 w-5 text-gray-600" />
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
              <Icon src={Clock} class="mr-2 h-5 w-5" />
              Class Schedule ({dialogClassDetails.online
                ? '1-hour classes'
                : '2-hour class'})
            </h4>
            <div class="space-y-2">
              {#each formatClassTimes(dialogClassDetails.classDays, dialogClassDetails.classTimes) as classTime (classTime)}
                <div class="flex items-center text-blue-800">
                  <Icon
                    src={ArrowUpCircle}
                    theme="mini"
                    class="mr-3 h-4 w-4 text-blue-600"
                  />
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
                <Icon src={Plus} class="mr-2 h-5 w-5" />
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
                  <Icon
                    src={isEnrolled(dialogClassDetails.id, selectedStudentUid)
                      ? Trash
                      : Plus}
                    class="h-5 w-5"
                  />
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
                      <Icon src={XCircle} theme="mini" class="mr-1 h-3 w-3" />
                      Class Full
                    {:else}
                      <Icon
                        src={CheckCircle}
                        theme="mini"
                        class="mr-1 h-3 w-3"
                      />
                      {classInfo.spotsRemaining} spots
                    {/if}
                  </span>
                </div>
              </div>

              <!-- Class Type & Instructor -->
              <div class="mb-4 space-y-2">
                <div class="flex items-center text-sm text-gray-600">
                  <Icon
                    src={classInfo.online ? ComputerDesktop : BuildingOffice}
                    class="mr-2 h-4 w-4"
                  />
                  {classInfo.online
                    ? 'Online Class'
                    : 'In-Person (Cambridge Public Library)'}
                </div>
                <div class="flex items-center text-sm text-gray-600">
                  <Icon src={User} class="mr-2 h-4 w-4" />
                  {`${classInfo.instructorFirstName} ${classInfo.instructorLastName}`}
                </div>
              </div>

              <!-- Class Times -->
              <div class="mb-4">
                <h4
                  class="mb-2 flex items-center text-sm font-semibold text-gray-700"
                >
                  <Icon src={Clock} class="mr-2 h-4 w-4" />
                  Class Times ({classInfo.online
                    ? '1-hour classes'
                    : '2-hour class'})
                </h4>
                <div class="space-y-1">
                  {#each formatClassTimes(classInfo.classDays, classInfo.classTimes) as classTime (classTime)}
                    <div class="flex items-center text-sm text-gray-600">
                      <Icon
                        src={ArrowUpCircle}
                        theme="mini"
                        class="mr-2 h-3 w-3 text-gray-400"
                      />
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
                    <Icon src={Users} class="mr-2 h-4 w-4" />
                    Your Enrolled Students
                  </h4>
                  <div class="space-y-1">
                    {#each Object.entries(studentUidToClassIds) as [studentUid, classIds] (studentUid)}
                      {#if classIds.includes(classInfo.id)}
                        <div class="flex items-center text-sm text-blue-700">
                          <Icon
                            src={CheckCircle}
                            theme="mini"
                            class="mr-2 h-3 w-3"
                          />
                          {uidToName[studentUid]}
                        </div>
                      {/if}
                    {/each}
                  </div>

                  <!-- Meeting Link -->
                  <div class="mt-3 border-t border-blue-200 pt-3">
                    <div class="flex items-center text-sm text-blue-700">
                      <Icon src={GlobeAlt} class="mr-2 h-4 w-4" />
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
                    {#if instructorEmails[classInfo.id]}
                      <div class="mt-1 flex items-center text-sm text-blue-700">
                        <Icon src={Envelope} class="mr-2 h-4 w-4" />
                        <a
                          href={`mailto:${instructorEmails[classInfo.id]}`}
                          target="_blank"
                          rel="noopener"
                          class="hover:underline"
                        >
                          Contact Instructor
                        </a>
                      </div>
                    {/if}
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
                    <Icon src={Plus} class="h-5 w-5" />
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
