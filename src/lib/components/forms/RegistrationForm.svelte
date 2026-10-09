<script lang="ts">
  import { refreshAll } from '$app/navigation'
  import Card from '#lib/components/Card.svelte'
  import {
    frlpJson,
    gendersJson,
    gradesJson,
    parentEducationJson,
    raceJson,
  } from '#lib/data/index.js'
  import { emptySemesterDates } from '#lib/data/collections.js'
  import { alert } from '#lib/stores.js'
  import { onDestroy, onMount } from 'svelte'
  import { superForm, type SuperValidated } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import FormCheckbox from '../FormCheckbox.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import { registrationSchema } from './schemas'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { ExclamationCircle } from '@steeze-ui/heroicons'

  interface Props {
    /** `/apply`'s `load` result for this child: the registration as form values. */
    data: SuperValidated<any>
    registration: {
      studentFirstName: string
      parentFirstName: string
      parentLastName: string
      submitted: boolean
    }
    /** Decided by the server, whose window is the one that's enforced. */
    window: { closed: boolean }
    childNumber: number
    email: string
    semesterDates?: Data.SemesterDates
  }

  let {
    data,
    registration,
    window: registrationWindow,
    childNumber,
    email,
    semesterDates = emptySemesterDates,
  }: Props = $props()

  // Posts to `/apply`'s `saveRegistration`/`submitRegistration` actions, which
  // do all the reading, writing and emailing with the Admin SDK - see
  // `#lib/server/studentRegistration`. `&child=` says which of the parent's
  // children; the server builds the document id from the parent's own uid.
  //
  // `invalidateAll` is off for the reason ApplyForm gives: a re-run `load`
  // pushes the stored values back into the form and would overwrite edits
  // made while it was in flight. Only a successful submit re-runs it, for the
  // `registration.submitted` that swaps the form for the confirmation.
  // svelte-ignore state_referenced_locally
  const saveAction = `?/saveRegistration&child=${childNumber}`
  // svelte-ignore state_referenced_locally
  const submitAction = `?/submitRegistration&child=${childNumber}`
  let lastAction: 'save' | 'submit' = 'save'
  // svelte-ignore state_referenced_locally
  const formResult = superForm(data, {
    validators: zod(registrationSchema as any) as any,
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
        await refreshAll()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    onError({ result }) {
      alert.trigger('error', result.error.message)
    },
  })

  const { form, enhance, submitting, isTainted, tainted } = formResult

  let saveButton: HTMLButtonElement | undefined = $state()

  // Server-rendered, so on screen before it works - see ApplyForm.
  let hydrated = $state(false)

  let saveInterval: number | undefined = undefined
  onMount(() => {
    hydrated = true
    if (!registration.submitted) {
      saveInterval = window.setInterval(() => {
        if (isTainted($tainted) && !$submitting) formResult.submit(saveButton)
      }, 300000)
    }
  })

  onDestroy(() => {
    clearInterval(saveInterval)
  })

  $effect(() => {
    if (registration.submitted) clearInterval(saveInterval)
  })

  function handleUnload(e: BeforeUnloadEvent) {
    if (!registration.submitted && isTainted($tainted)) {
      e.preventDefault()
      e.returnValue = 'Save changes before leaving?'
      return 'Save changes before leaving?'
    }
  }
</script>

<svelte:window onbeforeunload={handleUnload} />

{#if registrationWindow.closed && !registration.submitted}
  <Card class="mb-6 max-w-2xl border-red-200 bg-red-50">
    <div class="flex items-start gap-3">
      <Icon
        src={ExclamationCircle}
        class="mt-0.5 size-6 shrink-0 text-red-600"
      />
      <div>
        <h3 class="font-semibold text-red-800">Registration Deadline Passed</h3>
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

{#if registration.submitted}
  <div
    class="max-w-2xl rounded-md border border-green-200 bg-green-100 px-4 py-2 text-green-900 shadow-xs"
  >
    An account has been created for {registration.studentFirstName}! You will be
    able to enroll this child in classes once enrollment opens. Please make sure
    that you have successfully created an account for each child you wish to
    enroll this semester.
    <br /> <br /> Parent orientation will be on {new Date(
      semesterDates.parentOrientation,
    ).toDateString()}, so keep an eye out for an email with details!
    <br /> <br /> If you have any questions, or want to update something about a student
    account, reach out to contact@gbstem.org!
  </div>
{:else}
  <form
    novalidate
    method="POST"
    action={submitAction}
    use:enhance
    class="max-w-2xl"
    data-hydrated={hydrated || undefined}
  >
    <fieldset class="space-y-14" disabled={!hydrated || $submitting}>
      {#if registration.studentFirstName !== ''}
        <div
          class="w-full rounded-md border border-red-200 bg-red-100 px-4 py-2 text-center text-green-900 shadow-xs"
        >
          You have a student account creation in progress for {registration.studentFirstName}.
          Remember to complete this form and submit it by the deadline of {new Date(
            semesterDates.registrationsDue,
          ).toDateString()}! If you have any questions or problems with the
          form, please reach out to us at contact@gbstem.org!
        </div>
      {/if}
      <div class="grid gap-1">
        <span class="mt-3 text-lg font-bold">Student Account Creation Form</span
        >
        <p class="mb-2 text-sm text-gray-600">
          Please fill out this form with some basic information to create a
          student account for the semester. Once you have created an account for
          a student, you can sign that student up for classes when enrollment
          opens in a few weeks. Please ensure to create a different account for
          each student you intend to sign up. You will receive an email
          notification when class enrollment opens. Slots are on a first-come,
          first-served basis.
        </p>
        <span class="font-bold">Personal</span>
        <Card class="my-2 grid gap-3">
          <div class="rounded-md bg-gray-100 px-3 py-2 text-sm shadow-xs">
            {`Parent Name: ${registration.parentFirstName} ${registration.parentLastName}`}
          </div>
          <div class="rounded-md bg-gray-100 px-3 py-2 text-sm shadow-xs">
            {`Email: ${email}`}
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
            {#each raceJson as race (race.name)}
              <div class="flex items-center">
                <input
                  type="checkbox"
                  value={race.name}
                  bind:group={$form.personal.race}
                  id={`race-${race.name}`}
                  class="peer size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
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
          bind:this={saveButton}
          type="submit"
          formaction={saveAction}
          class="rounded-md bg-gray-100 px-4 py-2 text-gray-900 shadow-xs transition-colors duration-300 hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-500"
        >
          Save draft
        </button>
        <button
          type="submit"
          disabled={registrationWindow.closed}
          class="rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-xs transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
        >
          Submit
        </button>
      </div>
    </fieldset>
  </form>
{/if}
