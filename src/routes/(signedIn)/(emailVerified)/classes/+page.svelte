<script lang="ts">
  import type { EnrollRequestBody } from '../../../api/enroll/+server'
  import { db, user } from '$lib/client/firebase'
  import { onMount } from 'svelte'
  import Card from '$lib/components/Card.svelte'
  import Loading from '$lib/components/Loading.svelte'
  import { fade } from 'svelte/transition'
  import Dialog from '$lib/components/Dialog.svelte'
  import Button from '$lib/components/Button.svelte'
  import DialogActions from '$lib/components/DialogActions.svelte'
  import {
    collection,
    getDocs,
    getDoc,
    updateDoc,
    arrayUnion,
    doc,
    arrayRemove,
  } from 'firebase/firestore'
  import { alert } from '$lib/stores'
  import StudentSelect from '$lib/components/StudentSelect.svelte'
  import Select from '$lib/components/Select.svelte'
  import { coursesJson } from '$lib/data'
  import Alert from '$lib/components/Alert.svelte'
  import { formatDate, formatTime24to12 } from '$lib/utils'
  import {
    classesCollection,
    registrationsCollection,
    semesterDatesDocument,
  } from '$lib/data/constants'
  import Link from '$lib/components/Link.svelte'

  type ClassInfo = {
    id: string
    className: string
    classDays: string[]
    classTimes: string[]
    course: string
    instructorFirstName: string
    instructorLastName: string
    instructorEmail: string
    spotsRemaining: number
    meetingLink: string
    gradeRecommendation: string
    online: boolean
  }

  let classes: ClassInfo[] = []
  let loading = true
  let dialogEl: Dialog
  let dialogClassDetails: ClassInfo | null = null
  let selectedStudentUid = ''
  let userEmail = ''
  let userName = ''

  let classFilter = ''
  let onlyShowEnrolled = false

  let semesterDates: Data.SemesterDates = {
    classesEnd: '',
    classesStart: '',
    leadershipAppsDue: '',
    newInstructorAppsDue: '',
    returningInstructorAppsDue: '',
    instructorOrientation: '',
    newInstructorAppsOpen: '',
    returningInstructorAppsOpen: '',
    studentOrientation: '',
    registrationsDue: '',
    parentOrientation: '',
    registrationsOpen: '',
  }

  const studentUidToClassIds: {
    [studentUid: string]: string[]
  } = {}

  const studentUidToGrade: Record<string, string> = {}

  const uidToName: Record<string, string> = {}

  // Preload student data for the StudentSelect component
  let preloadedStudents: { uid: string; name: string }[] = []

  const courseToMinGrade: Record<string, number> = {
    'Environmental Science A': 5,
    'Environmental Science B': 5,
    'Python 1': 3,
    'Web Development': 5,
    'Python 2': 5,
    'Mathematics 2a': 1,
    'Mathematics 2b': 1,
    'Mathematics 3a': 3,
    'Mathematics 3b': 3,
    'Mathematics 4a': 5,
    'Mathematics 4b': 5,
    'Mathematics 5a': 6,
    'Mathematics 5b': 6,
    'Engineering 1': 2,
    'Engineering 2': 4,
    'Engineering 3': 5,
    'Lego Robotics Competition': 5,
  }

  let isStudent = true

  const determineStudentEnrollment = async (user: Data.User.Store) => {
    const uid = user.object.uid
    for (let i = 1; i < 6; ++i) {
      const docRef = await getDoc(
        doc(db, registrationsCollection, `${uid}-${i}`),
      )
      if (docRef.exists() && docRef.data()?.meta.submitted) {
        const studentUid = `${uid}-${i}`
        const studentClassIds = docRef.data()?.classes ?? []
        studentUidToClassIds[studentUid] = studentClassIds
        const name =
          `${docRef.data().personal.studentFirstName} ${
            docRef.data().personal.studentLastName
          }`.trim() || `Child ${i}`
        uidToName[studentUid] = name
        studentUidToGrade[studentUid] = docRef.data()?.academic.grade ?? ''

        // Add to preloaded students for StudentSelect component
        preloadedStudents.push({
          uid: studentUid,
          name: name,
        })
      }
    }
  }

  const getData = () => {
    return user.subscribe(async (user) => {
      if (user?.profile.role === 'instructor') {
        isStudent = false
      }
      const classesCollectionRef = collection(db, classesCollection)
      const querySnapshot = await getDocs(classesCollectionRef)
      classes = querySnapshot.docs.map((doc) => {
        const data = doc.data()
        let classInfo: ClassInfo = {
          id: doc.id,
          className: data.className,
          classDays: [],
          classTimes: [],
          course: data.course,
          instructorFirstName: data.instructorFirstName,
          instructorLastName: data.instructorLastName,
          instructorEmail: data.instructorEmail,
          spotsRemaining: data.students
            ? data.classCap - data.students.length
            : data.classCap,
          meetingLink: data.meetingLink,
          gradeRecommendation: data.gradeRecommendation,
          online: data.online,
        }
        // Assuming there are a fixed number of class days and times
        for (let i = 1; i <= 2; i++) {
          // Adjust this loop if there are more days and times
          if (data[`classDay${i}`] && data[`classTime${i}`]) {
            classInfo.classDays.push(data[`classDay${i}`])
            classInfo.classTimes.push(data[`classTime${i}`])
          }
        }
        return classInfo
      })
      // sort classes so that classes with most spots remaining are at the top
      classes.sort((a, b) => b.spotsRemaining - a.spotsRemaining)

      if (user && isStudent) {
        if (user.object.email) userEmail = user.object.email
        if (user.object.displayName) {
          userName = user.profile.firstName
          await determineStudentEnrollment(user)
        }
      }
      loading = false
    })
  }

  onMount(() => {
    getDoc(doc(db, 'semesterDates', semesterDatesDocument)).then((datesDoc) => {
      const datesDocExists = datesDoc.exists()
      if (datesDocExists) {
        semesterDates = datesDoc.data() as Data.SemesterDates
      }
    })
    getData()
  })

  function formatClassTimes(
    classDays: string[],
    classTimes: string[],
  ): string[] {
    return classDays.map(
      (day, index) => `${day} at ${formatTime24to12(classTimes[index])}`,
    )
  }

  const isEnrolled = (classId: string, studentUid: string): boolean => {
    if (studentUid === '') {
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
    const classDocRef = doc(db, classesCollection, classId)
    // get updated number of students in the class
    const classDoc = await getDoc(classDocRef)
    const classData = classDoc.data()
    const numStudents = classData?.students?.length ?? 0
    if (numStudents >= classData?.classCap) {
      alert.trigger('error', 'Class is full!')
      return
    }

    // throw alert if student attempts to enroll in more than 2 classes
    if (studentUidToClassIds[selectedStudentUid].length >= 2) {
      alert.trigger(
        'error',
        'Each student may only enroll in a maximum of 2 classes!',
      )
      return
    }

    const ageLimitsDoc = await getDoc(
      doc(db, registrationsCollection, selectedStudentUid),
    )
    const ageBypassEnabled = ageLimitsDoc.data()?.agreements.bypassAgeLimits

    if (!ageBypassEnabled) {
      if (
        dialogClassDetails &&
        Object.keys(courseToMinGrade).includes(dialogClassDetails.course) &&
        (studentUidToGrade[selectedStudentUid] == 'K' ||
          parseInt(studentUidToGrade[selectedStudentUid], 10) <
            courseToMinGrade[dialogClassDetails.course ?? ''])
      ) {
        alert.trigger(
          'error',
          `Students must be in grade ${
            courseToMinGrade[dialogClassDetails.course ?? '']
          } or higher to enroll in this class!`,
        )
        return
      }
    }

    await updateDoc(classDocRef, {
      students: arrayUnion(selectedStudentUid),
    }).catch((error) => {
      alert.trigger('error', 'Error enrolling in class!')
    })

    const registrationDocRef = doc(
      db,
      registrationsCollection,
      selectedStudentUid,
    )
    await updateDoc(registrationDocRef, {
      classes: arrayUnion(classId),
    })
      .then(() => {
        alert.trigger('success', 'Enrolled in class!')
        if (!dialogClassDetails) return
        const payload: EnrollRequestBody = {
          firstName: userName,
          instructor: dialogClassDetails.instructorFirstName,
          instructorEmail: dialogClassDetails.instructorEmail,
          classTimes: dialogClassDetails.classTimes,
          classDays: dialogClassDetails.classDays,
          course: dialogClassDetails.course,
          meetingLink: dialogClassDetails.meetingLink,
          online: dialogClassDetails.online,
          studentName: uidToName[selectedStudentUid],
        }
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
          dialogEl.close()
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
    const classDocRef = doc(db, classesCollection, classId)
    await updateDoc(classDocRef, {
      students: arrayRemove(selectedStudentUid),
    }).catch((error) => {
      alert.trigger('error', 'Error unenrolling from class!')
    })

    const registrationDocRef = doc(
      db,
      registrationsCollection,
      selectedStudentUid,
    )
    await updateDoc(registrationDocRef, {
      classes: arrayRemove(classId),
    })
      .then(() => {
        alert.trigger('success', 'Unenrolled from class!')
        dialogEl.close()
      })
      .catch((error) => {
        alert.trigger('error', 'Error unenrolling from class!')
      })
  }
</script>

<svelte:head>
  <title>Classes Overview</title>
</svelte:head>

<Dialog bind:this={dialogEl} size="min">
  <svelte:fragment slot="title">Class Details</svelte:fragment>

  <div slot="description" class="space-y-6 p-6">
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
                {dialogClassDetails.online ? 'Online Class' : 'In-Person Class'}
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
            {#each formatClassTimes(dialogClassDetails.classDays, dialogClassDetails.classTimes) as classTime}
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
                on:click={() => {
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
      <Button on:click={dialogEl.cancel}>Close</Button>
    </DialogActions>
  </div>
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
          options={coursesJson}
        />
        {#if classFilter !== ''}
          <Button color="blue" on:click={() => clearFilter()}
            >Remove Filter</Button
          >
        {/if}
      </div>
      {#if isStudent}
        <Button
          color={onlyShowEnrolled ? 'blue' : 'gray'}
          on:click={() => clearEnrolled()}
        >
          {onlyShowEnrolled ? 'Show all classes' : 'Show all enrolled classes'}
        </Button>
      {/if}
    </div>

    <div class="grid gap-6 md:grid-cols-2" transition:fade={{ duration: 500 }}>
      {#each classes as classInfo (classInfo.id)}
        {#if classFilter == '' || classFilter == classInfo.course}
          {#if !onlyShowEnrolled || Object.entries(studentUidToClassIds).some( ([studentUid, classIds]) => classIds.includes(classInfo.id), )}
            <Card
              class="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-xs transition-all duration-200 hover:border-gray-300 hover:shadow-lg"
            >
              <!-- Status Badge -->
              <div class="absolute top-4 right-4">
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

              <!-- Course Header -->
              <div class="mb-4">
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
                  {#each formatClassTimes(classInfo.classDays, classInfo.classTimes) as classTime}
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
              {#if Object.entries(studentUidToClassIds).some( ([studentUid, classIds]) => classIds.includes(classInfo.id), )}
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
                    {#each Object.entries(studentUidToClassIds) as [studentUid, classIds]}
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
                    on:click={() => {
                      dialogClassDetails = classInfo
                      dialogEl.open()
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
