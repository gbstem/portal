<script lang="ts">
  import { user } from '$lib/client/firebase'
  import Card from '$lib/components/Card.svelte'
  import { coursesJson, gendersJson, raceJson, reasonsJson } from '$lib/data'
  import {
    createEmptyApplication,
    normalizeApplicationData,
    toApplyFormValues as toFormValues,
  } from '$lib/helpers/applyForm'
  import { applicationService } from '$lib/services/applicationService'
  import { alert } from '$lib/stores'
  import { serverTimestamp } from 'firebase/firestore'
  import { cloneDeep, isEqual } from 'lodash-es'
  import { onDestroy, onMount } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import FormCheckbox from '../FormCheckbox.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import FormTextarea from '../FormTextarea.svelte'
  import Loading from '../Loading.svelte'
  import { applicationSchema } from './schemas'

  interface Props {
    semesterDates?: Data.SemesterDates
  }

  let {
    semesterDates = {
      classesEnd: '',
      classesStart: '',
      newInstructorAppsDue: '',
      returningInstructorAppsDue: '',
      instructorOrientation: '',
      newInstructorAppsOpen: '',
      returningInstructorAppsOpen: '',
      studentOrientation: '',
      registrationsDue: '',
      parentOrientation: '',
      registrationsOpen: '',
    },
  }: Props = $props()

  let loading = $state(true)
  let loadError = $state(false)
  let saving = $state(false)
  let dbValues: Data.Application

  let values: Data.Application = $state(createEmptyApplication())

  const schema = applicationSchema

  // svelte-ignore state_referenced_locally
  const formResult = superForm(
    defaults(toFormValues(values) as any, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      resetForm: false,
      dataType: 'json',
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
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
            essay: {
              ...values.essay,
              ...formVal.data.essay,
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
              created: values.timestamps.created || serverTimestamp(),
              updated: serverTimestamp(),
            },
          }
          applicationService
            .saveUserApplication(frozenUser.object.uid, updatedValues)
            .then(async () => {
              const freshApp = await applicationService.fetchUserApplication(
                frozenUser.object.uid,
              )
              await applicationService.submitApplicationApi(
                frozenUser.profile.firstName,
              )
              if (freshApp) {
                clearInterval(saveInterval)
                saveInterval = undefined
                values = cloneDeep(freshApp)
                dbValues = cloneDeep(freshApp)
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth',
                })
                alert.trigger('success', 'Your application has been submitted!')
              }
            })
            .catch((err: any) => {
              console.error('Apply form submit error:', err)
              const msg = err?.code || err?.message || 'An error occurred'
              alert.trigger('error', msg, Boolean(err?.code))
            })
        }
      },
      onError({ result }) {
        if (result.type === 'error') {
          alert.trigger('error', result.error.message)
        }
      },
    },
  )

  const { form, enhance, submitting } = formResult

  let saveInterval: number | undefined = undefined
  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        try {
          const applicationData = await applicationService.fetchUserApplication(
            user.object.uid,
          )
          if (applicationData) {
            values = cloneDeep(applicationData)
            dbValues = cloneDeep(applicationData)
            form.set(toFormValues(values))
            if (
              !values.meta.submitted &&
              (values.personal.email !== user.object.email ||
                values.personal.firstName !== user.profile.firstName ||
                values.personal.lastName !== user.profile.lastName)
            ) {
              values = normalizeApplicationData(
                values,
                user.object,
                user.profile,
              )
              form.set(toFormValues(values))
              await handleSave()
            }
          } else {
            values = normalizeApplicationData(null, user.object, user.profile)
            form.set(toFormValues(values))
            await handleSave()
          }
          if (!values.meta.submitted) {
            if (saveInterval === undefined) {
              saveInterval = window.setInterval(() => {
                handleSave()
              }, 300000)
            }
          }
        } catch (err) {
          // Without this the form would sit showing empty defaults that were
          // never persisted, and the periodic autosave would never start.
          console.error('[ApplyForm] Failed to load application:', err)
          loadError = true
          alert.trigger(
            'error',
            'Could not load your application. Please reload the page to try again.',
          )
        } finally {
          loading = false
        }
      }
    })
  })

  onDestroy(() => {
    clearInterval(saveInterval)
    saveInterval = undefined
  })

  function handleSave(): Promise<void> {
    if (values.meta.submitted || saving) return Promise.resolve()
    saving = true
    return new Promise<void>((resolve, reject) => {
      if ($user) {
        const frozenUser = $user
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
          essay: {
            ...values.essay,
            ...$form.essay,
          },
          agreements: {
            ...values.agreements,
            ...$form.agreements,
          },
          timestamps: {
            ...values.timestamps,
            created: values.timestamps.created || serverTimestamp(),
            updated: serverTimestamp(),
          },
        }
        applicationService
          .saveUserApplication(frozenUser.object.uid, updatedValues)
          .then(async () => {
            const applicationData =
              await applicationService.fetchUserApplication(
                frozenUser.object.uid,
              )
            if (applicationData) {
              values = cloneDeep(applicationData)
              dbValues = cloneDeep(applicationData)
            }
            saving = false
            alert.trigger('success', 'Your progress was saved.')
            resolve()
          })
          .catch((err) => {
            saving = false
            console.error('Apply form save error:', err)
            const msg = err?.code || err?.message || 'An error occurred'
            alert.trigger('error', msg, Boolean(err?.code))
            reject(err)
          })
      } else {
        saving = false
        resolve()
      }
    })
  }

  // React to loaded/saved values changing
  $effect(() => {
    form.set(toFormValues(values))
  })

  function handleUnload(e: BeforeUnloadEvent) {
    // Construct values comparison object
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
      essay: {
        ...values.essay,
        ...$form.essay,
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

<svelte:window onbeforeunload={handleUnload} />

{#if loading}
  <Loading />
{:else if loadError}
  <Card class="mx-auto w-fit text-center">
    <div class="space-y-3">
      <div class="font-bold">Couldn't load your application</div>
      <div class="text-sm">Please reload the page to try again.</div>
    </div>
  </Card>
{:else}
  <form use:enhance class="max-w-2xl">
    {#if new Date() >= new Date(semesterDates.newInstructorAppsDue)}
      <Card class="mb-6 border-red-200 bg-red-50">
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
              Application Deadline Passed
            </h3>
            <p class="mt-1 text-sm text-red-700">
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

    <fieldset
      class="space-y-14"
      disabled={values.meta.submitted || $submitting || saving}
    >
      <div class="grid gap-1">
        <span class="font-bold">Personal</span>
        <Card class="my-2 grid gap-3">
          <div class="rounded-md bg-gray-100 px-3 py-2 shadow-xs">
            {`Name: ${values.personal.firstName} ${values.personal.lastName}`}
          </div>
          <div class="rounded-md bg-gray-100 px-3 py-2 shadow-xs">
            {`Email: ${values.personal.email}`}
          </div>
          <div class="text-sm">
            Wrong name or email? Go to your <a class="link" href="/profile"
              >profile</a
            > to update your information.
          </div>
        </Card>

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
            label="Date of birth"
            type="date"
            bind:value={$form.personal.dateOfBirth}
          />
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="personal.gender"
            label="Gender"
            options={gendersJson}
            bind:value={$form.personal.gender}
          />
        </div>

        <div class="mt-4 grid gap-1">
          <span class="text-sm font-semibold"
            >Race / ethnicity (check all that apply)</span
          >
          <div class="grid grid-cols-2 gap-2">
            {#each raceJson as race (race.name)}
              <div class="flex items-center">
                <input
                  type="checkbox"
                  value={race.name}
                  bind:group={$form.personal.race}
                  id={`app-race-${race.name}`}
                  class="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
                />
                <label
                  for={`app-race-${race.name}`}
                  class="ml-2 cursor-pointer text-sm peer-disabled:text-gray-400"
                >
                  {race.name}
                </label>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="grid gap-1">
        <span class="font-bold">Academic</span>
        <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
          <div class="mt-2 flex flex-col gap-1.5 sm:col-span-2">
            <FormInput
              form={formResult}
              name="academic.school"
              label="Current school"
              bind:value={$form.academic.school}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="academic.graduationYear"
              label="Graduation year"
              type="number"
              bind:value={$form.academic.graduationYear}
            />
          </div>
        </div>
      </div>

      <div class="grid gap-1">
        <div class="mt-3 grid gap-1">
          <span class="text-sm font-bold text-gray-700"
            >Which of the following courses are you comfortable teaching? Check
            all that apply. Course descriptions are on our website.</span
          >
          <div class="mt-2 grid grid-cols-2 gap-2">
            {#each coursesJson as course (course.name)}
              <div class="flex items-center">
                <input
                  type="checkbox"
                  value={course.name}
                  bind:group={$form.program.courses}
                  id={`app-course-${course.name}`}
                  class="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
                />
                <label
                  for={`app-course-${course.name}`}
                  class="ml-2 cursor-pointer text-sm peer-disabled:text-gray-400"
                >
                  {course.name}
                </label>
              </div>
            {/each}
          </div>
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="program.preferences"
            label="If you have any preferences for the courses you teach, please list them here."
            placeholder="Preferences"
            bind:value={$form.program.preferences}
          />
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="program.timeSlots"
            label="Please describe your weekly availability. For example, 'weekdays after 4pm' or 'weekends anytime'."
            bind:value={$form.program.timeSlots}
          />
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <FormTextarea
            form={formResult}
            name="program.notAvailable"
            label="When will you not be available to teach classes during the semester? Include potential conflicts such as medical absences, vacations, and athletic events."
            bind:value={$form.program.notAvailable}
          />
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="program.inPerson"
            label="gbSTEM will offer FIRST Lego League Robotics in-person at the Cambridge Public Library. Check this box if you would be able to mentor and instruct Lego Robotics on Saturdays 1:00-3:00 pm. Please note that if you are interested in instructing Lego Robotics, you must be able to teach in-person and therefore must check this box."
            bind:checked={$form.program.inPerson}
          />
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="program.reason"
            label="How did you learn about gbSTEM?"
            options={reasonsJson}
            bind:value={$form.program.reason}
          />
        </div>

        <div class="mt-8">
          <span class="text-sm font-bold text-gray-700">Essays</span>
          <div class="mt-2 flex flex-col gap-1.5">
            <FormCheckbox
              form={formResult}
              name="essay.taughtBefore"
              label="Have you taught for gbSTEM before?"
              bind:checked={$form.essay.taughtBefore}
            />
          </div>

          <div class="mt-4 flex flex-col gap-1.5">
            <FormTextarea
              form={formResult}
              name="essay.academicBackground"
              label="Describe your academic background in any of the classes you said you were comfortable teaching. List any relevant coursework, projects, or extracurriculars. (500 char limit)"
              bind:value={$form.essay.academicBackground}
            />
          </div>

          {#if !$form.essay.taughtBefore}
            <div class="mt-4 flex flex-col gap-1.5">
              <FormTextarea
                form={formResult}
                name="essay.teachingScenario"
                label="Suppose your students are not engaging in the class. What would you do? (500 char limit)"
                required={!$form.essay.taughtBefore}
                bind:value={$form.essay.teachingScenario}
              />
            </div>

            <div class="mt-4 flex flex-col gap-1.5">
              <FormTextarea
                form={formResult}
                name="essay.why"
                label="Why do you want to teach for gbSTEM? (500 char limit)"
                required={!$form.essay.taughtBefore}
                bind:value={$form.essay.why}
              />
            </div>
          {/if}
        </div>

        <div class="mt-8 grid gap-1">
          <span class="text-sm font-bold text-gray-700">Agreements</span>
          <div class="mt-2 grid gap-4">
            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.entireProgram"
                label={`gbSTEM will run from ${new Date(
                  semesterDates.classesStart,
                ).toDateString()} to ${new Date(
                  semesterDates.classesEnd,
                ).toDateString()}. Do you confirm that you will be able to teach for the entirety of the program?`}
                required
                bind:checked={$form.agreements.entireProgram}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.timeCommitment"
                label="Do you hereby confirm that if you are selected as an instructor, that you will be able to make the weekly time commitment of 2 hours a week for each class you teach?"
                required
                bind:checked={$form.agreements.timeCommitment}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="agreements.submitting"
                label="I understand submitting means I can no longer make changes to my application. Don't check this box until you are sure that you are ready to submit."
                required
                bind:checked={$form.agreements.submitting}
              />
            </div>
          </div>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-2 gap-3">
        {#if values.meta.submitted}
          <div
            class="col-span-2 rounded-md border border-green-200 bg-green-100 px-4 py-2 text-center text-green-900 shadow-xs"
          >
            Application submitted and in review!
          </div>
        {:else}
          <button
            type="button"
            onclick={() => handleSave()}
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
        {/if}
      </div>
    </fieldset>
  </form>
{/if}
