<script lang="ts">
  import { page } from '$app/state'
  import { user } from '$lib/client/firebase'
  import Button from '$lib/components/Button.svelte'
  import Card from '$lib/components/Card.svelte'
  import ClassSchedule from '$lib/components/ClassSchedule.svelte'
  import StudentSchedule from '$lib/components/StudentSchedule.svelte'
  import StudentSelect from '$lib/components/StudentSelect.svelte'
  import SubClasses from '$lib/components/SubClasses.svelte'
  import ClassDetailsForm from '$lib/components/forms/ClassDetailsForm.svelte'
  import InterviewForm from '$lib/components/forms/InterviewForm.svelte'
  import StudentFeedbackForm from '$lib/components/forms/StudentFeedbackForm.svelte'
  import { semesterDates } from '$lib/data/collections'
  import { applicationService } from '$lib/services/applicationService'
  import { registrationService } from '$lib/services/registrationService'
  import { alert } from '$lib/stores'
  import { Icon } from '@steeze-ui/svelte-icon'
  import {
    AcademicCap,
    Calendar,
    CheckCircle,
    Clock,
    ExclamationCircle,
    InformationCircle,
    Plus,
    UserCircle,
  } from '@steeze-ui/heroicons'

  type ApplicationStatus =
    | 'accepted'
    | 'waitlisted'
    | 'rejected'
    | 'submitted'
    | 'interview'
    | 'substitute'
    | null

  type DashboardData = {
    application: {
      status: ApplicationStatus
    }
  }

  let loading = $state(true)
  let numSubmitted = $state(0)

  let data: DashboardData = $state({
    application: {
      status: null,
    },
  })

  const isStudent = $derived(page.data.user?.role === 'student')

  user.subscribe((userObj) => {
    if (userObj) {
      ;(async () => {
        try {
          if (!isStudent) {
            data.application.status = null
            data.application.status =
              await applicationService.fetchApplicationDashboardStatus(
                userObj.object.uid,
              )
            data = data
          } else {
            const slots = await registrationService.fetchChildRegistrationSlots(
              userObj.object.uid,
            )

            numSubmitted = slots.filter(
              (slot) => slot.exists && slot.data?.meta?.submitted,
            ).length
          }
        } catch (err) {
          console.error('Error fetching dashboard data:', err)
          alert.trigger(
            'error',
            'Could not load your dashboard. Please reload the page to try again.',
          )
        } finally {
          loading = false
        }
      })()
    }
  })

  let hasRightColumn = $derived(
    data.application.status === 'accepted' ||
      (isStudent && new Date() > new Date(semesterDates.studentOrientation)),
  )
</script>

<svelte:head>
  <title>Dashboard</title>
</svelte:head>
<h1 class="mb-4 text-5xl font-bold md:text-6xl">Dashboard</h1>

<div class="mx-auto flex max-w-6xl flex-col items-center px-2 py-8 md:px-8">
  {#if loading}
    <div class="w-full max-w-155 animate-pulse space-y-8">
      <!-- Card Skeleton 1 -->
      <div class="rounded-xl bg-white p-6 shadow-lg">
        <div class="mb-4 flex items-center">
          <div class="mr-2 h-6 w-6 rounded-full bg-gray-200"></div>
          <div class="h-6 w-48 rounded-md bg-gray-200"></div>
        </div>
        <div class="space-y-3">
          <div class="h-4 w-full rounded-md bg-gray-200"></div>
          <div class="h-4 w-5/6 rounded-md bg-gray-200"></div>
        </div>
        <div class="mt-6 h-10 w-full rounded-md bg-gray-200"></div>
      </div>
      <!-- Card Skeleton 2 (only for students, since they have multiple cards) -->
      {#if isStudent}
        <div class="rounded-xl bg-white p-6 shadow-lg">
          <div class="mb-4 flex items-center">
            <div class="mr-2 h-6 w-6 rounded-full bg-gray-200"></div>
            <div class="h-6 w-40 rounded-md bg-gray-200"></div>
          </div>
          <div class="space-y-3">
            <div class="h-4 w-full rounded-md bg-gray-200"></div>
            <div class="h-4 w-4/5 rounded-md bg-gray-200"></div>
          </div>
          <div class="mt-6 h-24 w-full rounded-md bg-gray-200"></div>
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="grid w-full gap-8 {hasRightColumn
        ? 'md:grid-cols-2'
        : 'max-w-155 grid-cols-1'}"
    >
      <div class="flex flex-col gap-8">
        {#if !isStudent && new Date() >= new Date(semesterDates.classesStart) && data.application.status === 'submitted'}
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon
                src={InformationCircle}
                class="mr-2 h-6 w-6 text-yellow-500"
              />
              <h2 class="text-xl font-bold text-gray-900">
                Application Received
              </h2>
            </div>
            <div class="mb-2 border-l-4 border-yellow-400 bg-yellow-50 p-4">
              Your instructor application was submitted after the deadline.
              Applications are now closed for this semester. We will keep your
              application on file and notify you about future opportunities.
            </div>
          </Card>
        {/if}
        {#if isStudent}
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon src={UserCircle} class="mr-2 h-6 w-6 text-blue-500" />
              <h2 class="text-xl font-bold text-gray-900">Your Students</h2>
            </div>
            <div class="mb-4">
              <StudentSelect />
            </div>
            <div class="flex flex-col gap-2">
              <Button
                href="/apply"
                class="flex w-full items-center justify-center gap-2"
                color="blue"
              >
                <Icon src={Plus} class="h-5 w-5" />
                Create or View A Student Account
              </Button>
            </div>
          </Card>
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon src={Clock} class="mr-2 h-6 w-6 text-yellow-500" />
              <h2 class="text-xl font-bold text-gray-900">Class Feedback</h2>
            </div>
            <StudentFeedbackForm />
          </Card>
        {/if}
        <!-- Application & Registration Section (conditionally rendered) -->
        {#if new Date() < new Date(semesterDates.classesStart) || (new Date() >= new Date(semesterDates.classesStart) && ((!isStudent && data.application.status !== 'accepted') || (isStudent && numSubmitted === 0)))}
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon src={AcademicCap} class="mr-2 h-6 w-6 text-green-500" />
              <h2 class="text-xl font-bold text-gray-900">
                Application & Registration
              </h2>
            </div>
            {#if new Date() < new Date(semesterDates.classesStart) || (new Date() >= new Date(semesterDates.classesStart) && !isStudent && data.application.status !== 'accepted')}
              {#if !isStudent}
                <div class="mb-4">
                  <h3 class="text-lg font-semibold">Instructor Application</h3>
                  {#if data.application.status === null}
                    <div
                      class="mb-2 flex items-center border-l-4 border-yellow-400 bg-yellow-50 p-4"
                    >
                      <Icon
                        src={InformationCircle}
                        class="mr-2 h-5 w-5 text-yellow-400"
                      />
                      <span
                        >Applications to be an instructor are due <span
                          class="font-bold"
                          >{new Date(
                            semesterDates.newInstructorAppsDue,
                          ).toDateString()}</span
                        > at 11:59 PM ET.</span
                      >
                    </div>
                  {/if}
                  <div class="mb-2">
                    <p>
                      {#if data.application.status === 'accepted'}
                        <span class="font-semibold text-green-700"
                          >You have been accepted to gbSTEM as an instructor! We
                          look forward to seeing you.</span
                        >
                      {:else if data.application.status === 'waitlisted'}
                        <span class="font-semibold text-yellow-700"
                          >You have been waitlisted. We will follow up with more
                          information!</span
                        >
                      {:else if data.application.status === 'rejected'}
                        <span class="font-semibold text-red-700"
                          >Unfortunately, instructor applications were extremely
                          competitive, and we were not able to accept you as an
                          instructor for gbSTEM.</span
                        >
                      {:else if data.application.status === 'submitted' || data.application.status === 'interview'}
                        <span class="font-semibold text-blue-700"
                          >Your application is submitted and in review!</span
                        >
                      {:else if data.application.status === 'substitute'}
                        <span class="font-semibold text-blue-700"
                          >You have been accepted as a substitute instructor.
                          Keep an eye on this page for listings!</span
                        >
                      {:else}
                        <span
                          >You haven't submitted an application. Make sure you
                          submit it by the deadline!</span
                        >
                      {/if}
                    </p>
                  </div>
                  <Button
                    href="/apply"
                    class="mt-5 flex w-full items-center justify-center gap-2"
                    color="blue"
                  >
                    <Icon src={Calendar} class="h-5 w-5" />
                    {data.application.status === null
                      ? 'Edit Application'
                      : 'View Application'}
                  </Button>
                </div>
              {:else}
                <div class="mb-4">
                  <h3 class="text-lg font-semibold">Student Registration</h3>
                  {#if numSubmitted > 0}
                    <div class="mt-2 font-semibold text-blue-700">
                      You currently have {numSubmitted} student{numSubmitted > 1
                        ? 's'
                        : ''} with accounts for this semester.
                    </div>
                  {:else}
                    <div class="mt-2 font-semibold text-red-700">
                      You have no student accounts set up for this semester.
                    </div>
                  {/if}
                  <Button
                    href="/apply"
                    class="mt-5 flex w-full items-center justify-center gap-2"
                    color="blue"
                  >
                    <Icon src={Plus} class="h-5 w-5" />
                    Create or View A Student Account
                  </Button>
                </div>
              {/if}
            {:else if new Date() >= new Date(semesterDates.classesStart) && ((!isStudent && data.application.status === null) || (isStudent && numSubmitted === 0))}
              <div class="mb-4">
                <div
                  class="mb-2 flex items-center border-l-4 border-red-400 bg-red-50 p-4"
                >
                  <Icon
                    src={ExclamationCircle}
                    class="mr-2 h-5 w-5 text-red-400"
                  />
                  <span>
                    {#if !isStudent}
                      The instructor application deadline has passed.
                      Applications were due <span class="font-bold"
                        >{new Date(
                          semesterDates.newInstructorAppsDue,
                        ).toDateString()}</span
                      > at 11:59 PM ET. Unfortunately, you cannot apply to be an instructor
                      for this semester. Please check back for future opportunities.
                    {:else}
                      The student registration deadline has passed.
                      Registrations were due <span class="font-bold"
                        >{new Date(
                          semesterDates.registrationsDue,
                        ).toDateString()}</span
                      > at 11:59 PM ET. Unfortunately, you cannot register students
                      for this semester. Please check back for future opportunities.
                    {/if}
                  </span>
                </div>
              </div>
            {/if}
          </Card>
        {/if}
        {#if data.application.status === 'accepted'}
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon src={AcademicCap} class="mr-2 h-6 w-6 text-indigo-500" />
              <h2 class="text-xl font-bold text-gray-900">Your Classes</h2>
            </div>
            <!-- Show ClassSchedule only after orientation -->
            {#if Date.now() > new Date(semesterDates.instructorOrientation).getTime()}
              <ClassSchedule {semesterDates} />
            {/if}
            <SubClasses subInstructor={false} />
          </Card>
        {:else if data.application.status === 'substitute'}
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon src={AcademicCap} class="mr-2 h-6 w-6 text-indigo-500" />
              <h2 class="text-xl font-bold text-gray-900">
                Substitute Classes
              </h2>
            </div>
            <SubClasses subInstructor={true} />
          </Card>
        {/if}
        {#if data.application.status === 'interview'}
          <Card class="rounded-xl bg-white p-6 shadow-lg">
            <div class="mb-4 flex items-center">
              <Icon src={Clock} class="mr-2 h-6 w-6 text-pink-500" />
              <h2 class="text-xl font-bold text-gray-900">Interview</h2>
            </div>
            <InterviewForm {semesterDates} />
          </Card>
        {/if}
      </div>
      {#if hasRightColumn}
        <div class="flex flex-col gap-8">
          <!-- Class Details Form for accepted instructors (moved to right column) -->
          {#if data.application.status === 'accepted'}
            <Card class="rounded-xl bg-white p-6 shadow-lg">
              <div class="mb-4 flex items-center">
                <Icon src={CheckCircle} class="mr-2 h-6 w-6 text-green-500" />
                <h2 class="text-xl font-bold text-gray-900">Class Details</h2>
              </div>
              <ClassDetailsForm {semesterDates} dialog={false} />
            </Card>
          {/if}
          <!-- Student Schedule Section -->
          {#if isStudent && new Date() > new Date(semesterDates.studentOrientation)}
            <Card class="rounded-xl bg-white p-6 shadow-lg">
              <div class="mb-4 flex items-center">
                <Icon src={Calendar} class="mr-2 h-6 w-6 text-purple-500" />
                <h2 class="text-xl font-bold text-gray-900">
                  Student Schedule
                </h2>
              </div>
              <StudentSchedule />
            </Card>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
