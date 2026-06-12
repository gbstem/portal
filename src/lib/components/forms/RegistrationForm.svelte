<script lang="ts">
  import type { RegistrationRequestBody } from '../../../routes/api/registration/+server'
  import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    Timestamp,
    deleteDoc,
  } from 'firebase/firestore'
  import {
    gendersJson,
    frlpJson,
    parentEducationJson,
    raceJson,
    gradesJson,
  } from '$lib/data'
  import { alert } from '$lib/stores'
  import { onDestroy, onMount } from 'svelte'
  import Card from '$lib/components/Card.svelte'
  import { db, user } from '$lib/client/firebase'
  import { cloneDeep, isEqual } from 'lodash-es'
  import { registrationsCollection } from '$lib/data/constants'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { registrationSchema } from './schemas'
  import type { FirebaseError } from 'firebase/app'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'

  export let childUid: string = ''

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

  let loading = true
  let saving = false
  let showValidation = false
  let dbValues: Data.Registration

  const emptyValues: Data.Registration = {
    personal: {
      email: '',
      studentFirstName: '',
      studentLastName: '',
      parentFirstName: '',
      parentLastName: '',
      gender: '',
      race: [],
      phoneNumber: '',
      dateOfBirth: '',
      frlp: '',
      parentEducation: '',
      secondaryEmail: '',
    },
    academic: {
      school: '',
      grade: '',
    },
    program: {
      csCourse: '',
      mathCourse: '',
      engineeringCourse: '',
      scienceCourse: '',
      inPerson: false,
      reason: '',
    },
    inPerson: {
      allergies: '',
      parentPickup: '',
    },
    agreements: {
      bypassAgeLimits: false,
      entireProgram: false,
      timeCommitment: false,
      mediaRelease: false,
      submitting: false,
    },
    meta: {
      id: '',
      uid: '',
      submitted: false,
    },
    timestamps: {
      created: serverTimestamp() as Timestamp,
      updated: serverTimestamp() as Timestamp,
    },
  }

  let values: Data.Registration = cloneDeep(emptyValues)

  const schema = registrationSchema

  const formResult = superForm(
    defaults(cloneDeep(emptyValues) as any, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      dataType: 'json',
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          showValidation = false
          const updatedValues = {
            ...values,
            personal: {
              ...values.personal,
              ...formVal.data.personal,
            },
            academic: {
              ...values.academic,
              ...formVal.data.academic,
            },
            program: {
              ...values.program,
              ...formVal.data.program,
            },
            inPerson: {
              ...values.inPerson,
              ...formVal.data.inPerson,
            },
            agreements: {
              ...values.agreements,
              ...formVal.data.agreements,
            },
            meta: {
              ...values.meta,
              submitted: true,
            },
            timestamps: {
              ...values.timestamps,
              updated: serverTimestamp(),
            },
          }
          setDoc(doc(db, registrationsCollection, childUid), updatedValues)
            .then(() => {
              getDoc(doc(db, registrationsCollection, childUid)).then(
                (applicationDoc) => {
                  const payload: RegistrationRequestBody = {
                    firstName: frozenUser.profile.firstName,
                    studentName: formVal.data.personal.studentFirstName,
                    parentOrientationDate: semesterDates.parentOrientation,
                    secondaryEmail: formVal.data.personal.secondaryEmail,
                  }
                  fetch('/api/registration', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                  }).then(async (res) => {
                    if (!res.ok) {
                      const { message } = await res.json()
                      console.error('Registration API error:', message)
                    }
                    const applicationData =
                      applicationDoc.data() as Data.Registration
                    clearInterval(saveInterval)
                    saveInterval = undefined
                    safeSetValues(applicationData)
                    window.scrollTo({
                      top: 0,
                      behavior: 'smooth',
                    })
                    alert.trigger(
                      'success',
                      'Your student account has been created!',
                    )
                  })
                },
              )
            })
            .catch((err: FirebaseError) => {
              console.error('Registration submit error:', err)
              alert.trigger('error', err.code, true)
            })
        }
      },
      onError({ result }) {
        showValidation = true
        if (result.type === 'error') {
          alert.trigger('error', result.error.message)
        }
      },
    },
  )

  const { form, enhance, submitting } = formResult

  let saveInterval: number | undefined = undefined
  let unsubscribeUser: (() => void) | undefined = undefined

  function safeSetValues(data: any) {
    if (!data) {
      values = cloneDeep(emptyValues)
      dbValues = cloneDeep(emptyValues)
      return
    }
    values = {
      ...cloneDeep(emptyValues),
      ...cloneDeep(data),
      personal: {
        ...cloneDeep(emptyValues.personal),
        ...(data.personal ? cloneDeep(data.personal) : {}),
      },
      academic: {
        ...cloneDeep(emptyValues.academic),
        ...(data.academic ? cloneDeep(data.academic) : {}),
      },
      program: {
        ...cloneDeep(emptyValues.program),
        ...(data.program ? cloneDeep(data.program) : {}),
      },
      inPerson: {
        ...cloneDeep(emptyValues.inPerson),
        ...(data.inPerson ? cloneDeep(data.inPerson) : {}),
      },
      agreements: {
        ...cloneDeep(emptyValues.agreements),
        ...(data.agreements ? cloneDeep(data.agreements) : {}),
      },
      meta: {
        ...cloneDeep(emptyValues.meta),
        ...(data.meta ? cloneDeep(data.meta) : {}),
      },
    }
    dbValues = cloneDeep(values)
  }

  const initializeForm = () => {
    if (unsubscribeUser) {
      unsubscribeUser()
      unsubscribeUser = undefined
    }
    loading = true
    unsubscribeUser = user.subscribe((user) => {
      if (user) {
        getDoc(doc(db, registrationsCollection, childUid)).then(
          (applicationDoc) => {
            const applicationExists = applicationDoc.exists()
            if (applicationExists) {
              const applicationData = applicationDoc.data() as Data.Registration
              safeSetValues(applicationData)
              if (
                !values.meta.submitted &&
                (values.personal.parentFirstName !== user.profile.firstName ||
                  values.personal.parentLastName !== user.profile.lastName)
              ) {
                values.personal.email = user.object.email as string
                values.personal.parentFirstName = user.profile.firstName
                values.personal.parentLastName = user.profile.lastName
                handleSave()
              }
            } else {
              values = cloneDeep(emptyValues)
              values.meta.uid = childUid
              values.meta.id = user.profile.id
              values.personal.email = user.object.email as string
              values.personal.parentFirstName = user.profile.firstName
              values.personal.parentLastName = user.profile.lastName
              handleSave()
            }
            loading = false
            if (new Date() > new Date(semesterDates.registrationsOpen)) {
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
  }

  onMount(() => {
    // Rely on the reactive statement below to run on initial mount
  })

  $: if (childUid) {
    initializeForm()
  }

  onDestroy(() => {
    clearInterval(saveInterval)
    saveInterval = undefined
    if (unsubscribeUser) {
      unsubscribeUser()
      unsubscribeUser = undefined
    }
  })

  function handleDelete() {
    if ($user) {
      if (confirm('Are you sure you want to delete this draft?')) {
        deleteDoc(doc(db, registrationsCollection, childUid))
          .then(() => {
            alert.trigger('success', 'Draft was successfully deleted.')
            location.reload()
          })
          .catch((err) => {
            alert.trigger('error', err.code, true)
          })
      }
    }
  }

  function handleSave() {
    if (loading || saving || $submitting) return
    showValidation = false
    saving = true
    return new Promise<void>((resolve, reject) => {
      if ($user) {
        const updatedValues = {
          ...values,
          personal: {
            ...values.personal,
            ...$form.personal,
          },
          academic: {
            ...values.academic,
            ...$form.academic,
          },
          program: {
            ...values.program,
            ...$form.program,
          },
          inPerson: {
            ...values.inPerson,
            ...$form.inPerson,
          },
          agreements: {
            ...values.agreements,
            ...$form.agreements,
          },
          timestamps: {
            ...values.timestamps,
            updated: serverTimestamp(),
          },
        }
        setDoc(doc(db, registrationsCollection, childUid), updatedValues)
          .then(() => {
            getDoc(doc(db, registrationsCollection, childUid)).then(
              (applicationDoc) => {
                const applicationData =
                  applicationDoc.data() as Data.Registration
                safeSetValues(applicationData)
                saving = false
                alert.trigger('success', 'Your progress was saved.')
                resolve()
              },
            )
          })
          .catch((err) => {
            saving = false
            console.error('Registration save error:', err)
            alert.trigger('error', err.code, true)
            reject()
          })
      }
    })
  }

  // React to loaded/saved values changing
  $: if (values) {
    $form.personal = {
      studentFirstName: values.personal?.studentFirstName || '',
      studentLastName: values.personal?.studentLastName || '',
      parentFirstName: values.personal?.parentFirstName || '',
      parentLastName: values.personal?.parentLastName || '',
      email: values.personal?.email || '',
      secondaryEmail: values.personal?.secondaryEmail || '',
      phoneNumber: values.personal?.phoneNumber || '',
      dateOfBirth: values.personal?.dateOfBirth || '',
      gender: values.personal?.gender || '',
      race: values.personal?.race || [],
      frlp: values.personal?.frlp || '',
      parentEducation: values.personal?.parentEducation || '',
    }
    $form.academic = {
      school: values.academic?.school || '',
      grade: values.academic?.grade || '',
    }
    $form.program = {
      csCourse: values.program?.csCourse || '',
      mathCourse: values.program?.mathCourse || '',
      engineeringCourse: values.program?.engineeringCourse || '',
      scienceCourse: values.program?.scienceCourse || '',
      inPerson:
        values.program?.inPerson !== undefined
          ? values.program.inPerson
          : false,
      reason: values.program?.reason || '',
    }
    $form.inPerson = {
      allergies: values.inPerson?.allergies || '',
      parentPickup: values.inPerson?.parentPickup || '',
    }
    $form.agreements = {
      mediaRelease:
        values.agreements?.mediaRelease !== undefined
          ? values.agreements.mediaRelease
          : false,
      bypassAgeLimits:
        values.agreements?.bypassAgeLimits !== undefined
          ? values.agreements.bypassAgeLimits
          : false,
      entireProgram:
        values.agreements?.entireProgram !== undefined
          ? values.agreements.entireProgram
          : false,
      timeCommitment:
        values.agreements?.timeCommitment !== undefined
          ? values.agreements.timeCommitment
          : false,
      submitting:
        values.agreements?.submitting !== undefined
          ? values.agreements.submitting
          : false,
    }
  }

  function handleUnload(e: BeforeUnloadEvent) {
    const currentValues = {
      ...values,
      personal: {
        ...values.personal,
        ...$form.personal,
      },
      academic: {
        ...values.academic,
        ...$form.academic,
      },
      program: {
        ...values.program,
        ...$form.program,
      },
      inPerson: {
        ...values.inPerson,
        ...$form.inPerson,
      },
      agreements: {
        ...values.agreements,
        ...$form.agreements,
      },
    }
    if (!isEqual(dbValues, currentValues)) {
      e.preventDefault()
      e.returnValue = 'Save changes before leaving?'
      return 'Save changes before leaving?'
    }
  }
</script>

<svelte:window on:beforeunload={handleUnload} />

{#if new Date() < new Date(semesterDates.registrationsOpen)}
  <Card class="mb-6 max-w-2xl border-red-200 bg-red-50">
    <div class="flex items-start gap-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="mt-0.5 h-6 w-6 shrink-0 text-red-600"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      You may register for the upcoming semester starting on
      <b>{new Date(semesterDates.registrationsOpen).toDateString()}</b>.
    </div>
  </Card>
{:else}
  {#if new Date() >= new Date(semesterDates.registrationsDue + 604800000) && !values.meta.submitted}
    <Card class="mb-6 max-w-2xl border-red-200 bg-red-50">
      <div class="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="mt-0.5 h-6 w-6 shrink-0 text-red-600"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <div>
          <h3 class="font-semibold text-red-800">
            Registration Deadline Passed
          </h3>
          <p class="mt-1 text-sm text-red-700">
            The student registration deadline has passed. Registrations were due <span
              class="font-semibold"
            >
              {new Date(semesterDates.registrationsDue).toDateString()}
            </span> at 11:59 PM ET. Unfortunately, you cannot register students for
            this semester.
          </p>
        </div>
      </div>
    </Card>
  {/if}

  {#if values.meta.submitted}
    <div
      class="max-w-2xl rounded-md border border-green-200 bg-green-100 px-4 py-2 text-green-900 shadow-xs"
    >
      An account has been created for {values.personal.studentFirstName}! You
      will be able to enroll this child in classes once enrollment opens. Please
      make sure that you have successfully created an account for each child you
      wish to enroll this semester.
      <br /> <br /> Parent orientation will be on {new Date(
        semesterDates.parentOrientation,
      ).toDateString()}, so keep an eye out for an email with details!
      <br /> <br /> If you have any questions, or want to update something about a
      student account, reach out to contact@gbstem.org!
    </div>
  {:else}
    <form use:enhance class="max-w-2xl">
      <fieldset class="space-y-14" disabled={loading || $submitting || saving}>
        {#if values.personal.studentFirstName !== ''}
          <div
            class="w-full rounded-md border border-red-200 bg-red-100 px-4 py-2 text-center text-green-900 shadow-xs"
          >
            You have a student account creation in progress for {values.personal
              .studentFirstName}. Remember to complete this form and submit it
            by the deadline of {new Date(
              semesterDates.registrationsDue,
            ).toDateString()}! If you have any questions or problems with the
            form, please reach out to us at contact@gbstem.org!
          </div>
        {/if}
        <div class="grid gap-1">
          <span class="mt-3 text-lg font-bold"
            >Student Account Creation Form</span
          >
          <p class="mb-2 text-sm text-gray-600">
            Please fill out this form with some basic information to create a
            student account for the semester. Once you have created an account
            for a student, you can sign that student up for classes when
            enrollment opens in a few weeks. Please ensure to create a different
            account for each student you intend to sign up. You will receive an
            email notification when class enrollment opens. Slots are on a
            first-come, first-served basis.
          </p>
          <span class="font-bold">Personal</span>
          <Card class="my-2 grid gap-3">
            <div class="rounded-md bg-gray-100 px-3 py-2 text-sm shadow-xs">
              {`Parent Name: ${values.personal.parentFirstName} ${values.personal.parentLastName}`}
            </div>
            <div class="rounded-md bg-gray-100 px-3 py-2 text-sm shadow-xs">
              {`Email: ${values.personal.email}`}
            </div>
            <div class="text-xs text-gray-500">
              Wrong name or email? Go to your <a class="link" href="/profile"
                >profile</a
              > to update your information.
            </div>
          </Card>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="personal.studentFirstName"
              label="Student first name"
              bind:value={$form.personal.studentFirstName}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="personal.studentLastName"
              label="Student last name"
              bind:value={$form.personal.studentLastName}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="personal.secondaryEmail"
              label="Secondary email"
              type="email"
              bind:value={$form.personal.secondaryEmail}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="personal.phoneNumber"
              label="Phone number"
              type="tel"
              bind:value={$form.personal.phoneNumber}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="personal.dateOfBirth"
              label="Student Date of birth"
              type="date"
              bind:value={$form.personal.dateOfBirth}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormSelect
              form={formResult}
              name="personal.gender"
              label="Student gender"
              options={gendersJson}
              bind:value={$form.personal.gender}
            />
          </div>

          <div class="mt-5 grid gap-1">
            <span class="text-sm font-semibold"
              >Race / ethnicity (check all that apply)</span
            >
            <div class="grid grid-cols-2 gap-2">
              {#each raceJson as race}
                <div class="flex items-center">
                  <input
                    type="checkbox"
                    value={race.name}
                    bind:group={$form.personal.race}
                    id={`race-${race.name}`}
                    class="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
                  />
                  <label
                    for={`race-${race.name}`}
                    class="ml-2 cursor-pointer text-sm peer-disabled:text-gray-400"
                  >
                    {race.name}
                  </label>
                </div>
              {/each}
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-1.5">
            <FormSelect
              form={formResult}
              name="personal.frlp"
              label="Eligible for federal free or reduced lunch program?"
              options={frlpJson}
              bind:value={$form.personal.frlp}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormSelect
              form={formResult}
              name="personal.parentEducation"
              label="Parent's highest level of education"
              options={parentEducationJson}
              bind:value={$form.personal.parentEducation}
            />
          </div>
        </div>

        <div class="grid gap-1">
          <span class="font-bold">Academic</span>
          <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
            <div class="mt-2 flex flex-col gap-1.5 sm:col-span-2">
              <FormInput
                form={formResult}
                name="academic.school"
                label="Student's current school"
                bind:value={$form.academic.school}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <FormSelect
                form={formResult}
                name="academic.grade"
                inputName="student-grade"
                label="Student Grade"
                options={gradesJson}
                bind:value={$form.academic.grade}
              />
            </div>
          </div>
        </div>

        <div class="grid gap-1">
          <span class="font-bold">Agreements</span>
          <div class="mt-2 grid gap-4">
            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.mediaRelease"
                label="If your child is participating in an in-person program, do you give consent to your child's picture being used in gbSTEM publications, including website, newsletter, and social media posts? Names and personal information will not be shared."
                bind:checked={$form.agreements.mediaRelease}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.entireProgram"
                label={`gbSTEM will run from ${new Date(semesterDates.classesStart).toDateString()} to ${new Date(semesterDates.classesEnd).toDateString()}. Will the student be able to participate throughout the entirety of the program?`}
                required
                bind:checked={$form.agreements.entireProgram}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.timeCommitment"
                label="Do you hereby confirm that the student can meet the gbSTEM weekly time commitment? Please understand that an unused spot for your child prevents others from joining or getting their preferred time slots. Students should not miss classes unless for medical reasons or family emergencies."
                required
                bind:checked={$form.agreements.timeCommitment}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.submitting"
                label="I understand submitting means I can no longer make changes to my registration. Don't check this box until you are sure that you are ready to submit."
                required
                bind:checked={$form.agreements.submitting}
              />
            </div>
          </div>
          <span class="mt-4 text-sm text-gray-500"
            >If you have any questions or concerns, please email
            <a href="mailto:contact@gbstem.org" class="link" target="_blank">
              contact@gbstem.org
            </a>.
          </span>
        </div>

        <div class="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            on:click={() => handleSave()}
            class="rounded-md bg-gray-100 px-4 py-2 text-gray-900 shadow-xs transition-colors duration-300 hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-500"
          >
            Save draft
          </button>
          <button
            type="submit"
            class="rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-xs transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
          >
            Submit
          </button>
        </div>
      </fieldset>
    </form>
  {/if}
{/if}
