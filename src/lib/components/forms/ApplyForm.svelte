<script lang="ts">
  import clsx from 'clsx'
  import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    Timestamp,
  } from 'firebase/firestore'
  import Input from '$lib/components/Input.svelte'
  import Select from '$lib/components/Select.svelte'
  import Textarea from '$lib/components/Textarea.svelte'
  import {
    gendersJson,
    reasonsJson,
    raceJson,
    coursesJson,
    coriRacesJson,
    coriSexesJson,
  } from '$lib/data'
  import { alert } from '$lib/stores'
  import { onDestroy, onMount } from 'svelte'
  import Card from '$lib/components/Card.svelte'
  import Form from '$lib/components/Form.svelte'
  import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
  import { db, storage, user } from '$lib/client/firebase'
  import { cloneDeep, isEqual } from 'lodash-es'
  // import value from '$lib/components/value.svelte'
  import Button from '../Button.svelte'
  import Link from '../Link.svelte'
  import { applicationsCollection } from '$lib/data/constants'

  export let semesterDates: Data.SemesterDates = {
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

  let disabled = true
  let showValidation = false
  let dbValues: Data.Application

  let values: Data.Application = {
    personal: {
      email: '',
      firstName: '',
      lastName: '',
      gender: '',
      race: [],
      phoneNumber: '',
      dateOfBirth: '',
    },
    academic: {
      school: '',
      graduationYear: '',
    },
    program: {
      courses: [],
      preferences: '',
      timeSlots: '',
      notAvailable: '',
      inPerson: false,
      reason: '',
    },
    essay: {
      taughtBefore: false,
      academicBackground: '',
      teachingScenario: '',
      why: '',
    },
    agreements: {
      entireProgram: false,
      timeCommitment: false,
      submitting: false,
    },
    meta: {
      id: '',
      uid: '',
      submitted: false,
      interview: false,
    },
    timestamps: {
      created: serverTimestamp() as Timestamp,
      updated: serverTimestamp() as Timestamp,
    },
  }
  let saveInterval: number | undefined = undefined
  onMount(() => {
    return user.subscribe((user) => {
      if (user) {
        getDoc(doc(db, applicationsCollection, user.object.uid)).then(
          (applicationDoc) => {
            const applicationExists = applicationDoc.exists()
            if (applicationExists) {
              const applicationData = applicationDoc.data() as Data.Application
              values = cloneDeep(applicationData)
              dbValues = cloneDeep(applicationData)
              if (
                !values.meta.submitted &&
                (values.personal.email !== user.object.email ||
                  values.personal.firstName !== user.profile.firstName ||
                  values.personal.lastName !== user.profile.lastName)
              ) {
                values.personal.email = user.object.email as string
                values.personal.firstName = user.profile.firstName
                values.personal.lastName = user.profile.lastName
                handleSave()
              }
            } else {
              values.meta.uid = user.object.uid
              values.meta.id = user.profile.id
              values.personal.email = user.object.email as string
              values.personal.firstName = user.profile.firstName
              values.personal.lastName = user.profile.lastName
              handleSave()
            }
            if (!values.meta.submitted) {
              disabled = false
              if (saveInterval === undefined) {
                saveInterval = window.setInterval(() => {
                  handleSave()
                }, 300000)
              }
            }
          },
        )
      }
    })
  })

  onDestroy(() => {
    clearInterval(saveInterval)
    saveInterval = undefined
  })
  function modifiedValues() {
    return {
      ...values,
      timestamps: {
        ...values.timestamps,
        updated: serverTimestamp(),
      },
    }
  }
  function handleSave(disable: boolean = false) {
    if (!disabled) {
      showValidation = false
      if (disable) {
        disabled = true
      }
      return new Promise<void>((resolve, reject) => {
        if ($user) {
          const frozenUser = $user
          setDoc(
            doc(db, applicationsCollection, frozenUser.object.uid),
            modifiedValues(),
          )
            .then(() => {
              getDoc(
                doc(db, applicationsCollection, frozenUser.object.uid),
              ).then((applicationDoc) => {
                const applicationData =
                  applicationDoc.data() as Data.Application
                values = cloneDeep(applicationData)
                dbValues = cloneDeep(applicationData)
                if (disable) {
                  disabled = false
                }
                alert.trigger('success', 'Your application was saved.')
                resolve()
              })
            })
            .catch((err) => {
              if (disable) {
                disabled = false
              }
              console.log(err)
              alert.trigger('error', err.code, true)
              reject()
            })
        }
      })
    }
  }
  function uploadFile(file: File, filePath: string) {
    const fileRef = ref(storage, filePath)
    return new Promise((resolve, reject) =>
      uploadBytes(fileRef, file)
        .then(() => {
          getDownloadURL(fileRef).then((url) => {
            resolve(url)
          })
        })
        .catch(reject),
    )
  }
  function handleSubmit(e: CustomEvent<SubmitData>) {
    if ($user) {
      const frozenUser = $user
      if (e.detail.error === null) {
        // if (
        //   values.program.inPerson &&
        //   !values.program.timeSlots.includes(
        //     'saturday-2-30-4-30-pm-you-need-to-select-this-option-if-you-want-the-in-person-class',
        //   )
        // ) {
        //   alert.trigger(
        //     'error',
        //     'To be available to teach in-person classes, you must select the Saturday 2:30-4:30pm timeslot option.',
        //     false,
        //   )
        //   return
        // }
        // if (
        //   values.program.courses.includes('lego-robotics-competition') &&
        //   values.program.inPerson === false
        // ) {
        //   alert.trigger(
        //     'error',
        //     'Please confirm that you are available to teach in-person if you want to teach Lego Robotics.',
        //     false,
        //   )
        //   return true
        // }
        showValidation = false
        disabled = true
        values.meta.submitted = true
        setDoc(
          doc(db, applicationsCollection, frozenUser.object.uid),
          modifiedValues(),
        )
          .then(() => {
            alert.trigger('success', 'Your application has been submitted!')
            getDoc(doc(db, applicationsCollection, frozenUser.object.uid)).then(
              (applicationDoc) => {
                fetch('/api/application', {
                  method: 'POST',
                  body: JSON.stringify({
                    firstName: frozenUser.profile.firstName,
                  }),
                }).then(async (res) => {
                  if (!res.ok) {
                    const { message } = await res.json()
                    console.log(message)
                  }
                  const applicationData =
                    applicationDoc.data() as Data.Application
                  clearInterval(saveInterval)
                  saveInterval = undefined
                  values = cloneDeep(applicationData)
                  dbValues = cloneDeep(applicationData)
                  window.scrollTo({
                    top: 0,
                    behavior: 'smooth',
                  })
                  alert.trigger(
                    'success',
                    'Your application has been submitted!',
                  )
                })
              },
            )
          })
          .catch((err) => {
            disabled = false
            alert.trigger('error', err.code, true)
          })
      } else {
        showValidation = true
        alert.trigger('error', e.detail.error)
      }
    }
  }
  function handleUnload(e: BeforeUnloadEvent) {
    if (!isEqual(dbValues, values)) {
      e.preventDefault()
      e.returnValue = 'Save changes before leaving?'
      return 'Save changes before leaving?'
    }
  }
</script>

<svelte:window on:beforeunload={handleUnload} />
<Form
  class={clsx('max-w-2xl', showValidation && 'show-validation')}
  on:submit={handleSubmit}
>
  {#if new Date() >= new Date(semesterDates.newInstructorAppsDue)}
    <Card class="mb-6 bg-red-50 border-red-200">
      <div class="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="h-6 w-6 text-red-600 shrink-0 mt-0.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <div>
          <h3 class="font-semibold text-red-800">
            Application Deadline Passed
          </h3>
          <p class="text-red-700 text-sm mt-1">
            The instructor application deadline has passed. Applications were
            due <span class="font-semibold">
              {new Date(semesterDates.newInstructorAppsDue).toDateString()}
            </span> at 11:59 PM ET. Unfortunately, you cannot submit an application
            for this semester.
          </p>
        </div>
      </div>
    </Card>
  {/if}
  <fieldset class="space-y-14" {disabled}>
    <div class="grid gap-1">
      <span class="font-bold">Personal</span>
      <Card class="my-2 grid gap-3">
        <div class="rounded-md bg-gray-100 px-3 py-2 shadow-sm">
          {`Name: ${values.personal.firstName} ${values.personal.lastName}`}
        </div>
        <div class="rounded-md bg-gray-100 px-3 py-2 shadow-sm">
          {`Email: ${values.personal.email}`}
        </div>
        <div class="text-sm">
          Wrong name or email? Go to your <a class="link" href="/profile"
            >profile</a
          > to update your information.
        </div>
      </Card>
      <Input
        type="tel"
        bind:value={values.personal.phoneNumber}
        label="Phone number"
        floating
        required
        pattern="[\d\s\-\+]+"
      />
      <Input
        type="date"
        bind:value={values.personal.dateOfBirth}
        label="Date of birth"
        floating
        required
      />

      <Select
        bind:value={values.personal.gender}
        label="Gender"
        options={gendersJson}
        floating
        required
      />
      <div class="grid gap-1">
        <span>Race / ethnicity (check all that apply)</span>
        <div class="grid grid-cols-2">
          {#each raceJson as race}
            <Input
              type="checkbox"
              bind:value={values.personal.race}
              label={race.name}
            />
          {/each}
        </div>
      </div>
    </div>
    <div class="grid gap-1">
      <span class="font-bold">Academic</span>
      <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
        <div class="sm:col-span-2">
          <Input
            type="text"
            bind:value={values.academic.school}
            label="Current school"
            floating
            required
          />
        </div>
        <Input
          type="number"
          bind:value={values.academic.graduationYear}
          label="Graduation year"
          min={new Date().getFullYear() - 30}
          max={new Date().getFullYear() + 20}
          floating
          required
        />
      </div>
    </div>
    <div class="grid gap-1">
      <div class="mt-3 grid gap-1">
        <span class="font-bold"
          >Which of the following courses are you comfortable teaching? Check
          all that apply. Course descriptions are on our website.</span
        >
        <div class="grid grid-cols-2 gap-2">
          {#each coursesJson as course}
            <Input
              type="checkbox"
              bind:value={values.program.courses}
              label={course.name}
              required
            />
          {/each}
        </div>
      </div>
      <div class="mt-4">
        <span class="font-bold"
          >If you have any preferences for the courses you teach, please list
          them here.</span
        >
        <Input
          type="text"
          bind:value={values.program.preferences}
          label="Preferences"
          floating
        />
      </div>

      <div class="mt-3 grid gap-1">
        <span class="font-bold">Timeslots</span>
        <Input
          type="text"
          bind:value={values.program.timeSlots}
          label="Please describe your weekly availability. For example, 'weekdays after 4pm' or 'weekends anytime'."
          required
        />
      </div>
      <Input
        type="checkbox"
        bind:value={values.program.inPerson}
        label="gbSTEM will offer FIRST Lego League Robotics in-person at the Cambridge Public Library. Check this box if you would be able to mentor and instruct Lego Robotics on Saturdays 1:00-3:00 pm. Please note that if you are interested in instructing Lego Robotics, you must be able to teach in-person and therefore must check this box."
      />

      <div class="mt-2">
        <Textarea
          bind:value={values.program.notAvailable}
          label="When will you not be available to teach classes during the semester? Include potential conflicts such as medical absences, vacations, and athletic events."
          required
        />
      </div>
      <div class="mt-2">
        <Select
          bind:value={values.program.reason}
          label="How did you learn about gbSTEM?"
          options={reasonsJson}
          floating
          required
        />
      </div>
      <div class="mt-5">
        <span class="font-bold">Essays</span>
        <div class="mt-2">
          <Input
            type="checkbox"
            bind:value={values.essay.taughtBefore}
            label="Have you taught for gbSTEM before?"
          />
        </div>
        <div class="mt-2">
          <Textarea
            bind:value={values.essay.academicBackground}
            label="Describe your academic background in any of the classes you said you were comfortable teaching. List any relevant coursework, projects, or extracurriculars. (500 char limit)"
            required
            maxlength={500}
          />
        </div>
        {#if !values.essay.taughtBefore}
          <div class="mt-2">
            <Textarea
              bind:value={values.essay.teachingScenario}
              label="Suppose your students are not engaging in the class. What would you do? (500 char limit)"
              required
              maxlength={500}
            />
          </div>
          <div class="mt-2">
            <Textarea
              bind:value={values.essay.why}
              label="Why do you want to teach for gbSTEM? (500 char limit)"
              required
              maxlength={500}
            />
          </div>
        {/if}
      </div>
      <div class="grid gap-1">
        <span class="font-bold mt-8">Agreements</span>
        <div class="grid">
          <Input
            type="checkbox"
            bind:value={values.agreements.entireProgram}
            label={`gbSTEM will run from ${new Date(
              semesterDates.classesStart,
            ).toDateString()} to ${new Date(
              semesterDates.classesEnd,
            ).toDateString()}. Do you confirm that you will be able to teach for the entirety of the program?`}
            required
          />
          <Input
            type="checkbox"
            bind:value={values.agreements.timeCommitment}
            label="Do you hereby confirm that if you are selected as an instructor, that you will be able to make the weekly time commitment of 2 hours a week for each class you teach? "
            required
          />
          <Input
            type="checkbox"
            bind:value={values.agreements.submitting}
            label="I understand submitting means I can no longer make changes to my application. Don't check this box until you are sure that you are ready to submit."
            required
          />
        </div>
      </div>
      <div class={clsx('grid gap-3', !values.meta.submitted && 'grid-cols-2')}>
        {#if values.meta.submitted}
          <div
            class="rounded-md bg-green-100 px-4 py-2 text-center text-green-900 shadow-sm"
          >
            Application submitted and in review!
          </div>
        {:else}
          <button
            type="button"
            on:click={() => handleSave(true)}
            class="rounded-md bg-gray-100 px-4 py-2 text-gray-900 shadow-sm transition-colors duration-300 hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-500"
            >Save draft</button
          >
          <button
            type="submit"
            class="rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-sm transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
            >Submit</button
          >
        {/if}
      </div>
    </div>
  </fieldset>
</Form>
