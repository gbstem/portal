<script lang="ts">
  import { user } from '$lib/client/firebase'
  import { classDetailsFormSchema } from '$lib/components/forms/schemas'
  import { coursesJson, daysOfWeekJson } from '$lib/data'
  import {
    addCoInstructor,
    coInstructorAddError,
    coInstructorDisplayName,
    coInstructorUids,
    generateNewClassId,
    getDefaultClassValues,
    getMeetingDates,
    normalizeInstructorEmail,
    removeCoInstructor,
    scheduleSourceChanged,
    toFormValues,
    type CoInstructor,
  } from '$lib/helpers/classDetailsForm'
  import { classService } from '$lib/services/classService'
  import { alert } from '$lib/stores'
  import { cn } from '$lib/utils'
  import { onMount, untrack } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import Button from '../Button.svelte'
  import Card from '../Card.svelte'
  import Dialog from '../Dialog.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import Loading from '../Loading.svelte'
  import { ClassStatus } from '../helpers/ClassStatus'
  import type { MeetingLinkRequestBody } from '../../../routes/api/meetingLink/+server'

  interface Props {
    semesterDates: Data.SemesterDates
    open?: boolean
    dialog?: boolean
  }

  let {
    semesterDates,
    open = $bindable(false),
    dialog = false,
  }: Props = $props()

  let loading = $state(true)
  let loadError = $state(false)
  let disabled = $state(false)
  let showValidation = $state(false)
  let isCreatingNewClass = $state(false)
  let isCreatingLink = $state(false)

  let values: Data.Class = $state(getDefaultClassValues())

  // Co-instructor identities, keyed by uid. `null` means the lookup came back
  // and that account is gone; a uid simply *absent* from this map hasn't been
  // resolved yet (in flight, or the request failed). Keeping those two cases
  // apart is what makes the drop safe: only a confirmed-`null` uid is removed
  // on save, so one failed request can never wipe a class's co-instructors.
  let identities: Record<string, CoInstructor | null> = $state({})
  let coInstructorEmail = $state('')
  let coInstructorError = $state('')
  let addingCoInstructor = $state(false)

  const schema = classDetailsFormSchema

  const CONFIRMATION_TEXT =
    'I understand submitting will immediately make my class visible to students and available for registration, ' +
    'and any edits will be immediately visible as well. I confirm this is the correct class and these class ' +
    'times will work for me.'

  // svelte-ignore state_referenced_locally
  const formResult = superForm(
    defaults(toFormValues(values) as any, zod(schema as any) as any) as any,
    {
      id: untrack(() => dialog)
        ? 'class-details-dialog'
        : 'class-details-inline',
      SPA: true,
      validators: zod(schema as any) as any,
      resetForm: false,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        showValidation = false
        disabled = true
        if ($user) {
          try {
            // `confirmation` is validated but deliberately not part of the
            // class document, so it is dropped here rather than riding the
            // spread into Firestore.
            const { confirmation: _confirmation, ...formFields } = formVal.data
            const newValues = {
              ...values,
              ...formFields,
            }

            // The schedule used to be driven by a "create a schedule for me?"
            // checkbox, which meant an instructor editing their class cap
            // could silently leave `meetingTimes` describing days the class no
            // longer meets on. It's derived from the save instead: rebuild it
            // exactly when the fields it's built from changed, and make the
            // instructor agree first if that overwrites a real schedule.
            const hasStoredSchedule = (values.meetingTimes?.length ?? 0) > 0
            let rebuildSchedule =
              !hasStoredSchedule || scheduleSourceChanged(values, newValues)

            if (rebuildSchedule && hasStoredSchedule) {
              rebuildSchedule = confirm(
                'You changed your class days or times, so your class schedule ' +
                  'has to be rebuilt.\n\n' +
                  'This replaces your existing schedule - including any changes ' +
                  'you made to individual sessions - and moves the meeting dates ' +
                  'for every student already enrolled in this class.\n\n' +
                  'Rebuild the schedule?',
              )
              if (!rebuildSchedule) {
                // Saving the new days without rebuilding is the inconsistency
                // this replaced, so back out entirely and leave their edits on
                // screen to undo.
                disabled = false
                alert.trigger(
                  'info',
                  'Nothing was saved. Put your class days and times back if you want to keep your existing schedule.',
                )
                return
              }
            }

            if (rebuildSchedule) {
              const meetingTimes = getMeetingDates(
                newValues.classDay1,
                newValues.classDay2,
                newValues.classTime1,
                newValues.classTime2,
                new Date(semesterDates.classesStart),
                new Date(semesterDates.classesEnd),
              )
              newValues.meetingTimes = meetingTimes
              newValues.feedbackCompleted = new Array(meetingTimes.length).fill(
                false,
              )
              newValues.classStatuses = new Array(meetingTimes.length).fill(
                ClassStatus.ClassInFuture,
              )
            }

            // Every uid in the form was vouched for by
            // /api/lookupCoInstructor when it was added, and /api/classDetails
            // checks any newly added one again. `droppedUids` are the ones
            // whose accounts have since been deleted; they're the only ones
            // removed without the owner asking, and only because there is
            // nobody left to ask about. See `loadCoInstructors`.
            newValues.otherInstructorUids =
              newValues.otherInstructorUids.filter(
                (uid: string) => !droppedUids.has(uid),
              )

            // Determined before the meeting link, not after: /api/meetingLink
            // authorizes on the class id, applying the same test
            // /api/classDetails applies to the save.
            const classId = currentClassId()

            if (newValues.online && newValues.meetingLink === '') {
              newValues.meetingLink = await createLink(classId, newValues)
            }

            // Only what the class should look like. Who owns it, whether an
            // added co-instructor is eligible, and which dashboards list it
            // are settled server-side, in one transaction.
            await classService.saveClassDetails({
              classId,
              details: {
                course: newValues.course,
                gradeRecommendation: newValues.gradeRecommendation,
                classCap: newValues.classCap,
                meetingLink: newValues.meetingLink,
                classDay1: newValues.classDay1,
                classTime1: newValues.classTime1,
                classDay2: newValues.classDay2,
                classTime2: newValues.classTime2,
                online: newValues.online,
                otherInstructorUids: newValues.otherInstructorUids,
              },
              schedule: rebuildSchedule
                ? {
                    meetingTimes: newValues.meetingTimes,
                    feedbackCompleted: newValues.feedbackCompleted,
                    classStatuses: newValues.classStatuses,
                  }
                : undefined,
            })

            disabled = true
            alert.trigger(
              'success',
              `Class details saved! You can join class by clicking the Join Class button above!`,
            )
            setTimeout(() => location.reload(), 2000)
          } catch (err: any) {
            console.error('[ClassDetailsForm] Error saving class details:', err)
            disabled = false
            alert.trigger('error', err.code || err.message, true)
          }
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

  const { form, enhance, delayed } = formResult

  // Derived from `$form`, so they have to come after it is destructured.
  const formUids = $derived(($form.otherInstructorUids ?? []) as string[])
  const unresolvedUids = $derived(
    formUids.filter((uid) => !(uid in identities)),
  )
  const coInstructors = $derived(
    formUids
      .map((uid) => identities[uid])
      .filter((identity): identity is CoInstructor => Boolean(identity)),
  )
  const droppedUids = $derived(
    new Set(formUids.filter((uid) => identities[uid] === null)),
  )

  function selectClass(classId: string) {
    selectedClassId = classId
    values = instructorClasses[classId]
    disabled = true
    isCreatingNewClass = false
  }

  function createNewClass() {
    selectedClassId = ''
    values = getDefaultClassValues()
    disabled = false
    isCreatingNewClass = true
  }

  let instructorClasses: { [classId: string]: Data.Class } = $state({})
  let selectedClassId = $state('')
  let availableClassIds: string[] = $state([])

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        try {
          const userClasses = await classService.fetchInstructorClasses()

          instructorClasses = userClasses
          availableClassIds = Object.keys(instructorClasses).sort()

          if (availableClassIds.length > 0) {
            selectedClassId = availableClassIds[0]
            values = instructorClasses[selectedClassId]
            disabled = true
          }
        } catch (err) {
          console.error('[ClassDetailsForm] Failed to load classes:', err)
          loadError = true
          alert.trigger(
            'error',
            'Could not load class details. Please reload the page to try again.',
          )
        } finally {
          loading = false
        }
      }
    })
  })

  /**
   * The id the class is saved under: the one being edited, or the next free
   * one for a class that doesn't exist yet. `generateNewClassId` is a pure
   * function of `availableClassIds`, so calling it here and again at save
   * time yields the same id.
   */
  function currentClassId(): string {
    return (
      selectedClassId ||
      generateNewClassId(availableClassIds, $user?.object.uid ?? '')
    )
  }

  /**
   * Books the recurring Teams meeting for a class and returns its join URL.
   *
   * The Graph call itself lives in `/api/meetingLink`. This used to fetch a
   * client-credentials token from `/api/token` and call Graph from the
   * browser, which meant handing every signed-in visitor a token carrying the
   * app registration's tenant-wide application permissions.
   */
  async function createLink(
    classId: string,
    newValues: Data.Class,
  ): Promise<string> {
    if (newValues.classDay1 === '') {
      alert.trigger(
        'error',
        'Please select at least one class day before creating a meeting link.',
      )
      return ''
    }

    isCreatingLink = true

    try {
      const res = await fetch('/api/meetingLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          course: newValues.course,
          classDay1: newValues.classDay1,
          classDay2: newValues.classDay2 ?? '',
        } satisfies MeetingLinkRequestBody),
      })
      if (!res.ok) {
        throw new Error(`Meeting link request failed: ${res.status}`)
      }
      const { joinUrl } = await res.json()
      alert.trigger('success', 'Meeting link created!')
      return joinUrl
    } catch (err) {
      console.error('[ClassDetailsForm] Meeting link creation error:', err)
      alert.trigger('error', 'Failed to create meeting link. Please try again.')
      return ''
    } finally {
      isCreatingLink = false
    }
  }

  /**
   * Resolves any uid the form holds that we don't have an identity for yet.
   *
   * An `$effect` rather than a `$derived` because the work is an async fetch,
   * which a derived can't do - it reads `unresolvedUids` and writes
   * `identities`, a different node, so this isn't the state-copying shape.
   * The early return on an empty list is what makes it settle: filling
   * `identities` empties `unresolvedUids`, and the next run stops there.
   *
   * On failure nothing is written, so the uids stay unresolved and are
   * retried rather than being treated as deleted accounts.
   */
  $effect(() => {
    const toResolve = unresolvedUids
    if (toResolve.length === 0) return

    let cancelled = false
    classService
      .resolveCoInstructors(toResolve)
      .then((resolved) => {
        if (cancelled) return
        const byUid = new Map(resolved.map((one) => [one.uid, one]))
        identities = {
          ...identities,
          // A requested uid the server didn't return has no account left.
          ...Object.fromEntries(
            toResolve.map((uid) => [uid, byUid.get(uid) ?? null]),
          ),
        }
      })
      .catch((err) => {
        console.error('[ClassDetailsForm] Failed to load co-instructors:', err)
      })

    return () => {
      cancelled = true
    }
  })

  async function addCoInstructorByEmail() {
    const email = normalizeInstructorEmail(coInstructorEmail)
    coInstructorError = ''
    if (!email) {
      coInstructorError = 'Enter an email address.'
      return
    }

    addingCoInstructor = true
    try {
      const result = await classService.lookupCoInstructor(email)
      if (!result.ok) {
        coInstructorError = result.message
        return
      }

      const candidate = result.coInstructor
      const rejection = coInstructorAddError(
        coInstructors,
        candidate,
        $user?.object.uid ?? '',
      )
      if (rejection) {
        coInstructorError = rejection
        return
      }

      identities = { ...identities, [candidate.uid]: candidate }
      $form.otherInstructorUids = coInstructorUids(
        addCoInstructor(coInstructors, candidate),
      )
      coInstructorEmail = ''
    } finally {
      addingCoInstructor = false
    }
  }

  function removeCoInstructorByUid(uid: string) {
    coInstructorError = ''
    $form.otherInstructorUids = coInstructorUids(
      removeCoInstructor(coInstructors, uid),
    )
  }

  // React to parent values changing (e.g. loaded data or cancel changes)
  $effect(() => {
    form.set(toFormValues(values))
  })
</script>

{#snippet coInstructorField()}
  <div class="mt-2 flex flex-col gap-1.5">
    <span class="text-sm font-bold">Co-instructors</span>
    <p class="text-xs text-gray-600">
      Add anyone teaching this class with you, one at a time. Only instructors
      who have been interviewed and accepted by gbSTEM can be added. Keep in
      mind that only one instructor per class should fill out this form.
    </p>

    {#if coInstructors.length > 0}
      <ul class="mt-1 flex flex-col gap-1.5">
        {#each coInstructors as coInstructor (coInstructor.uid)}
          <li
            class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2"
            data-co-instructor={coInstructor.email}
          >
            <span class="min-w-0 text-sm">
              <span class="font-semibold"
                >{coInstructorDisplayName(coInstructor)}</span
              >
              <span class="text-gray-600">{coInstructor.email}</span>
              {#if !coInstructor.accepted}
                <span
                  class="ml-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800"
                >
                  No longer an accepted instructor - please remove
                </span>
              {/if}
            </span>
            <Button
              color="red"
              type="button"
              class="min-h-8 px-2 py-1 text-xs"
              onclick={() => removeCoInstructorByUid(coInstructor.uid)}
            >
              Remove
            </Button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="mt-1 flex flex-wrap items-start gap-2">
      <input
        type="email"
        name="coInstructorEmail"
        placeholder="co-instructor@example.com"
        bind:value={coInstructorEmail}
        onkeydown={(event) => {
          // Enter inside a form submits it; this field adds instead.
          if (event.key === 'Enter') {
            event.preventDefault()
            addCoInstructorByEmail()
          }
        }}
        class="h-12 min-w-0 flex-1 appearance-none rounded-md border border-gray-400 px-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400"
      />
      <Button
        color="blue"
        type="button"
        class="h-12"
        disabled={addingCoInstructor}
        onclick={addCoInstructorByEmail}
      >
        {addingCoInstructor ? 'Checking...' : 'Add'}
      </Button>
    </div>

    {#if coInstructorError}
      <p class="text-xs font-semibold text-red-500" role="alert">
        {coInstructorError}
      </p>
    {/if}
  </div>
{/snippet}

{#if dialog === true}
  <Dialog bind:open size="full" alert>
    {#snippet title()}
      <div class="flex items-center justify-between">
        Your class details <Button
          color="red"
          class="font-light"
          onclick={() => (open = false)}>Close</Button
        >
      </div>
    {/snippet}
    {#snippet description()}
      <div>
        {#if loading}
          <div class="py-8">
            <Loading />
          </div>
        {:else if loadError}
          <div class="py-8 text-center text-sm text-red-600">
            Could not load class details. Please close and try again.
          </div>
        {:else}
          <Card class="sticky top-2 z-50 flex justify-between gap-3 p-3 md:p-3">
            <form
              use:enhance
              class={cn(showValidation && 'show-validation', 'w-full')}
            >
              {#if disabled}
                <Button
                  color="blue"
                  class="mb-5"
                  type="button"
                  onclick={() => (disabled = false)}>Edit class details</Button
                >
              {/if}

              <fieldset class="mt-4 space-y-4" disabled={disabled || $delayed}>
                <p class="text-sm text-gray-600">
                  Please do not fill this form out until you have been told by
                  gbSTEM leadership what class you will be teaching. Submitting
                  this form will generate a meeting link for your class; you can
                  join using the 'Join Class' button in the portal.
                </p>

                <!-- Class Management Section -->
                <div class="rounded-lg bg-gray-50 p-4">
                  <h3 class="mb-3 text-lg font-semibold">
                    Manage Your Classes
                  </h3>

                  <div class="mb-3 flex flex-wrap gap-2">
                    {#each availableClassIds as classId (classId)}
                      <Button
                        color={selectedClassId === classId ? 'blue' : 'gray'}
                        type="button"
                        onclick={() => selectClass(classId)}
                      >
                        Class {classId.split('-')[1]}
                        {#if instructorClasses[classId]?.course}
                          - {instructorClasses[classId].course}
                        {/if}
                      </Button>
                    {/each}

                    <Button
                      color="green"
                      type="button"
                      onclick={createNewClass}
                    >
                      + Create New Class
                    </Button>
                  </div>

                  {#if isCreatingNewClass}
                    <p class="text-sm text-blue-600">Creating new class...</p>
                  {:else if selectedClassId}
                    <p class="text-sm text-gray-600">
                      Editing Class {selectedClassId.split('-')[1]}
                    </p>
                  {:else}
                    <p class="text-sm text-gray-600">
                      No classes created yet. Click "Create New Class" to start.
                    </p>
                  {/if}
                </div>

                <h2 class="text-xl font-bold">
                  {isCreatingNewClass
                    ? 'New Class Details'
                    : selectedClassId
                      ? `Class ${selectedClassId.split('-')[1]} Details`
                      : 'Class Details'}
                </h2>

                <div class="mt-2 flex flex-col gap-1.5">
                  <FormSelect
                    form={formResult}
                    name="course"
                    label="Course"
                    options={coursesJson}
                    bind:value={$form.course}
                  />
                </div>

                <div class="mt-2 flex flex-col gap-1.5">
                  <FormInput
                    form={formResult}
                    name="gradeRecommendation"
                    label="Grade recommendation. For example, 3-5 or 6-8."
                    bind:value={$form.gradeRecommendation}
                  />
                </div>

                <div class="grid gap-1">
                  <span class="mt-2 text-sm font-bold text-gray-700"
                    >Online classes meet once weekly at consistent days and
                    times throughout the semester and run for 60 minutes each;
                    with the exception of math, which meets twice weekly for 60
                    minutes each. In-person classes meet once a week on a
                    weekend afternoon at the Cambridge Public Library.
                  </span>

                  <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
                    <div class="flex flex-col gap-1.5 sm:col-span-2">
                      <FormSelect
                        form={formResult}
                        name="classDay1"
                        label="Meeting day 1"
                        options={daysOfWeekJson}
                        bind:value={$form.classDay1}
                      />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <FormInput
                        form={formResult}
                        name="classTime1"
                        label="Meeting time 1"
                        type="time"
                        bind:value={$form.classTime1}
                      />
                    </div>
                  </div>

                  {#if $form.course && $form.course
                      .toLowerCase()
                      .includes('math') && $form.online}
                    <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
                      <div class="flex flex-col gap-1.5 sm:col-span-2">
                        <FormSelect
                          form={formResult}
                          name="classDay2"
                          label="Meeting day 2"
                          options={daysOfWeekJson}
                          bind:value={$form.classDay2}
                        />
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <FormInput
                          form={formResult}
                          name="classTime2"
                          label="Meeting time 2"
                          type="time"
                          bind:value={$form.classTime2}
                        />
                      </div>
                    </div>
                  {/if}
                </div>

                <div class="mt-2 flex flex-col gap-1.5">
                  <FormInput
                    form={formResult}
                    name="classCap"
                    label="Class capacity"
                    type="number"
                    bind:value={$form.classCap}
                  />
                </div>

                {@render coInstructorField()}

                {#if $form.online}
                  <div class="mt-2 flex flex-col gap-1.5">
                    <FormInput
                      form={formResult}
                      name="meetingLink"
                      label="Your meeting link. If you have Zoom Pro/Google Meet Pro and prefer to use it, you may enter the link here. Otherwise, you should use the Teams link."
                      bind:value={$form.meetingLink}
                    />
                  </div>
                {/if}

                <div class="mt-4 flex flex-col gap-1.5">
                  <FormCheckbox
                    form={formResult}
                    name="online"
                    label="Class taught online?"
                    bind:checked={$form.online}
                  />
                </div>

                <div class="mt-2 flex flex-col gap-1.5">
                  <FormCheckbox
                    form={formResult}
                    name="confirmation"
                    label={CONFIRMATION_TEXT}
                    bind:checked={$form.confirmation}
                  />
                </div>

                <div class="flex justify-end">
                  <Button color="blue" type="submit" disabled={$delayed}
                    >Submit</Button
                  >
                </div>
              </fieldset>
            </form>
          </Card>
        {/if}
      </div>
    {/snippet}
  </Dialog>
{:else}
  {#if loading}
    <div class="py-8">
      <Loading />
    </div>
  {:else if loadError}
    <div class="py-8 text-center text-sm text-red-600">
      Could not load class details. Please reload the page to try again.
    </div>
  {:else}
    <form use:enhance class={cn(showValidation && 'show-validation', 'w-full')}>
      {#if disabled}
        <Button
          color="blue"
          class="mb-5"
          type="button"
          onclick={() => (disabled = false)}>Edit class details</Button
        >
      {/if}

      <fieldset class="mt-4 space-y-4" disabled={disabled || $delayed}>
        <p class="text-sm text-gray-600">
          Please do not fill this form out until you have been told by gbSTEM
          leadership what class you will be teaching.
        </p>

        <!-- Class Management Section -->
        <div class="rounded-lg bg-gray-50 p-4">
          <h3 class="mb-3 text-lg font-semibold">Manage Your Classes</h3>

          <div class="mb-3 flex flex-wrap gap-2">
            {#each availableClassIds as classId (classId)}
              <Button
                color={selectedClassId === classId ? 'blue' : 'gray'}
                type="button"
                onclick={() => selectClass(classId)}
              >
                Class {classId.split('-')[1]}
                {#if instructorClasses[classId]?.course}
                  - {instructorClasses[classId].course}
                {/if}
              </Button>
            {/each}

            <Button color="green" type="button" onclick={createNewClass}>
              + Create New Class
            </Button>
          </div>

          {#if isCreatingNewClass}
            <p class="text-sm text-blue-600">Creating new class...</p>
          {:else if selectedClassId}
            <p class="text-sm text-gray-600">
              Editing Class {selectedClassId.split('-')[1]}
            </p>
          {:else}
            <p class="text-sm text-gray-600">
              No classes created yet. Click "Create New Class" to start.
            </p>
          {/if}
        </div>

        <h2 class="text-xl font-bold">
          {isCreatingNewClass
            ? 'New Class Details'
            : selectedClassId
              ? `Class ${selectedClassId.split('-')[1]} Details`
              : 'Class Details'}
        </h2>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="course"
            label="Course"
            options={coursesJson}
            bind:value={$form.course}
          />
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="gradeRecommendation"
            label="Grade recommendation. For example, 3-5 or 6-8."
            bind:value={$form.gradeRecommendation}
          />
        </div>

        <div class="grid gap-1">
          <span class="mt-2 text-sm font-bold text-gray-700"
            >Online classes meet once weekly at consistent days and times
            throughout the semester and run for 60 minutes each; with the
            exception of math, which meets twice weekly for 60 minutes each.
            In-person classes meet once a week on a weekend afternoon at the
            Cambridge Public Library.
          </span>

          <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
            <div class="flex flex-col gap-1.5 sm:col-span-2">
              <FormSelect
                form={formResult}
                name="classDay1"
                label="Meeting day 1"
                options={daysOfWeekJson}
                bind:value={$form.classDay1}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <FormInput
                form={formResult}
                name="classTime1"
                label="Meeting time 1"
                type="time"
                bind:value={$form.classTime1}
              />
            </div>
          </div>

          {#if $form.course && $form.course
              .toLowerCase()
              .includes('math') && $form.online}
            <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
              <div class="flex flex-col gap-1.5 sm:col-span-2">
                <FormSelect
                  form={formResult}
                  name="classDay2"
                  label="Meeting day 2"
                  options={daysOfWeekJson}
                  bind:value={$form.classDay2}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <FormInput
                  form={formResult}
                  name="classTime2"
                  label="Meeting time 2"
                  type="time"
                  bind:value={$form.classTime2}
                />
              </div>
            </div>
          {/if}
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="classCap"
            label="Class capacity"
            type="number"
            bind:value={$form.classCap}
          />
        </div>

        {@render coInstructorField()}

        <div class="mt-4 flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="online"
            label="Class taught online?"
            bind:checked={$form.online}
          />
        </div>

        {#if $form.meetingLink === '' && $form.online}
          <Button
            color="blue"
            type="button"
            disabled={isCreatingLink || $delayed}
            onclick={async () =>
              ($form.meetingLink = await createLink(currentClassId(), {
                ...values,
                ...$form,
              }))}
          >
            {#if isCreatingLink}
              Creating link...
            {:else}
              Create meeting link
            {/if}
          </Button>
        {/if}

        {#if $form.online}
          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="meetingLink"
              label="Your meeting link. If you have Zoom Pro/Google Meet Pro and prefer to use it, you may enter the link here. Otherwise, you should use the Teams link."
              bind:value={$form.meetingLink}
            />
          </div>
        {/if}

        <div class="mt-2 flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="confirmation"
            label={CONFIRMATION_TEXT}
            bind:checked={$form.confirmation}
          />
        </div>

        <div class="mt-4 flex justify-end">
          <Button color="blue" type="submit" disabled={$delayed}>Submit</Button>
        </div>
      </fieldset>
    </form>
  {/if}
{/if}
