<script lang="ts">
  import Card from '$lib/components/Card.svelte'
  import { coursesJson, gendersJson, raceJson, reasonsJson } from '$lib/data'
  import { emptySemesterDates } from '$lib/data/collections'
  import { invalidateAll } from '$app/navigation'
  import { alert } from '$lib/stores'
  import { onDestroy, onMount } from 'svelte'
  import { superForm, type SuperValidated } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import FormCheckbox from '../FormCheckbox.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import FormTextarea from '../FormTextarea.svelte'
  import { applicationSchema } from './schemas'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { ExclamationCircle } from '@steeze-ui/heroicons'

  interface Props {
    /** `/apply`'s `load` result: the stored application as form values. */
    data: SuperValidated<any>
    application: {
      firstName: string
      lastName: string
      submitted: boolean
      /** Decided by the server, whose deadline is the one that's enforced. */
      deadlinePassed: boolean
    }
    email: string
    semesterDates?: Data.SemesterDates
  }

  let {
    data,
    application,
    email,
    semesterDates = emptySemesterDates,
  }: Props = $props()

  // The form posts to `/apply`'s `saveApplication`/`submitApplication`
  // actions, which do all the reading, writing and emailing with the Admin
  // SDK - see `$lib/server/instructorApplication`.
  //
  // `invalidateAll` is off because re-running `load` pushes the stored values
  // back into the form when it lands, overwriting anything typed while it was
  // in flight. Only a successful submit re-runs it, for the
  // `application.submitted` that locks the form.
  let lastAction: 'save' | 'submit' = 'save'
  // svelte-ignore state_referenced_locally
  const formResult = superForm(data, {
    validators: zod(applicationSchema as any) as any,
    resetForm: false,
    invalidateAll: false,
    dataType: 'json',
    onSubmit({ submitter, validators }) {
      lastAction = submitter === saveButton ? 'save' : 'submit'
      // A draft is unfinished by definition; the server checks its shape.
      if (lastAction === 'save') validators(false)
    },
    async onUpdate({ form: updated, result }) {
      if (updated.message) {
        alert.trigger(
          result.type === 'success' ? 'success' : 'error',
          updated.message,
        )
      }
      if (result.type === 'success' && lastAction === 'submit') {
        await invalidateAll()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    onError({ result }) {
      alert.trigger('error', result.error.message)
    },
  })

  const { form, enhance, submitting, isTainted, tainted } = formResult

  let saveButton: HTMLButtonElement | undefined = $state()

  // The form is server-rendered, so it is on screen before it works: until
  // hydration a click on a Select does nothing and a submit would post
  // without the JSON payload the actions read. Disabled until then.
  let hydrated = $state(false)

  let saveInterval: number | undefined = undefined
  onMount(() => {
    hydrated = true
    if (!application.submitted) {
      saveInterval = window.setInterval(() => {
        if (isTainted($tainted) && !$submitting) formResult.submit(saveButton)
      }, 300000)
    }
  })

  onDestroy(() => {
    clearInterval(saveInterval)
  })

  $effect(() => {
    if (application.submitted) clearInterval(saveInterval)
  })

  function handleUnload(e: BeforeUnloadEvent) {
    if (!application.submitted && isTainted($tainted)) {
      e.preventDefault()
      e.returnValue = 'Save changes before leaving?'
      return 'Save changes before leaving?'
    }
  }
</script>

<svelte:window onbeforeunload={handleUnload} />

<form
  novalidate
  method="POST"
  action="?/submitApplication"
  use:enhance
  class="max-w-2xl"
  data-hydrated={hydrated || undefined}
>
  {#if application.deadlinePassed && !application.submitted}
    <Card class="mb-6 border-red-200 bg-red-50">
      <div class="flex items-start gap-3">
        <Icon
          src={ExclamationCircle}
          class="mt-0.5 size-6 shrink-0 text-red-600"
        />
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
    disabled={!hydrated || application.submitted || $submitting}
  >
    <div class="grid gap-1">
      <span class="font-bold">Personal</span>
      <Card class="my-2 grid gap-3">
        <div class="rounded-md bg-gray-100 px-3 py-2 shadow-xs">
          {`Name: ${application.firstName} ${application.lastName}`}
        </div>
        <div class="rounded-md bg-gray-100 px-3 py-2 shadow-xs">
          {`Email: ${email}`}
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
                class="peer size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
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
                class="peer size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
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
      {#if application.submitted}
        <div
          class="col-span-2 rounded-md border border-green-200 bg-green-100 px-4 py-2 text-center text-green-900 shadow-xs"
        >
          Application submitted and in review!
        </div>
      {:else}
        <button
          bind:this={saveButton}
          type="submit"
          formaction="?/saveApplication"
          class="rounded-md bg-gray-100 px-4 py-2 text-gray-900 shadow-xs transition-colors duration-300 hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-500"
        >
          Save draft
        </button>
        <button
          type="submit"
          disabled={application.deadlinePassed}
          class="rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-xs transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
        >
          Submit
        </button>
      {/if}
    </div>
  </fieldset>
</form>
