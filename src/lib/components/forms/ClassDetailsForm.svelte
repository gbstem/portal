<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import { coursesJson, daysOfWeekJson } from '$lib/data'
  import { classesCollection } from '$lib/data/collections'
  import { alert } from '$lib/stores'
  import {
    cn,
    getInstructorClasses,
    updateInstructorClassMappings,
  } from '$lib/utils'
  import { doc, setDoc } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import { otherInstructorEmailsSchema } from '$lib/components/forms/schemas'
  import Button from '../Button.svelte'
  import Card from '../Card.svelte'
  import Dialog from '../Dialog.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import { ClassStatus } from '../helpers/ClassStatus'

  export let semesterDates: Data.SemesterDates
  export let classDetailsDialogEl: Dialog | undefined = undefined
  export let dialog = false

  let disabled = false
  let showValidation = false
  let submitted = false
  let isCreatingNewClass = false
  let isCreatingLink = false

  let values: Data.Class = {
    classDay1: '',
    classTime1: '',
    classDay2: '',
    classTime2: '',
    meetingLink: '',
    gradeRecommendation: '',
    course: '',
    submitting: false,
    meetingTimes: [],
    completedClassDates: [],
    feedbackCompleted: [],
    classStatuses: [],
    instructorFirstName: '',
    instructorLastName: '',
    instructorEmail: '',
    otherInstructorEmails: '',
    classCap: 7,
    online: true,
    students: [],
  }

  let createClassSchedule = true

  const schema = z.object({
    course: z.string().min(1, 'Course is required'),
    gradeRecommendation: z.string().optional().default(''),
    classCap: z.coerce.number().min(0, 'Capacity must be at least 0'),
    meetingLink: z.string().optional().default(''),
    classDay1: z.enum(
      [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ],
      {
        errorMap: () => ({ message: 'Day 1 is required' }),
      },
    ),
    classTime1: z.string().min(1, 'Time 1 is required'),
    classDay2: z
      .enum([
        '',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ])
      .optional()
      .default(''),
    classTime2: z.string().optional().default(''),
    online: z.boolean().default(true),
    otherInstructorEmails: otherInstructorEmailsSchema,
    submitting: z.boolean().default(false),
  })

  const formResult = superForm(
    defaults(
      {
        course: '',
        gradeRecommendation: '',
        classCap: 7,
        meetingLink: '',
        classDay1: '' as any,
        classTime1: '',
        classDay2: '' as any,
        classTime2: '',
        online: true,
        otherInstructorEmails: '',
        submitting: false,
      },
      zod(schema as any) as any,
    ) as any,
    {
      id: dialog ? 'class-details-dialog' : 'class-details-inline',
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        showValidation = false
        disabled = true
        if ($user) {
          try {
            const frozenUser = $user
            const newValues = {
              ...values,
              ...formVal.data,
            }

            if (newValues.otherInstructorEmails) {
              newValues.otherInstructorEmails = newValues.otherInstructorEmails
                .split(/[\s,]+/)
                .map((email: string) => email.trim().toLowerCase())
                .filter((email: string) => email.length > 0)
                .join(', ')
            } else {
              newValues.otherInstructorEmails = ''
            }

            if (createClassSchedule) {
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

            newValues.instructorFirstName = frozenUser.profile.firstName
            newValues.instructorLastName = frozenUser.profile.lastName
            newValues.instructorEmail = frozenUser.object.email as string

            if (newValues.online && newValues.meetingLink === '') {
              newValues.meetingLink = await createLink(newValues)
            }

            // Determine class ID for new classes
            let classId = selectedClassId
            if (!classId) {
              const existingNumbers = availableClassIds
                .filter((id) => id.startsWith(frozenUser.object.uid + '-'))
                .map((id) => parseInt(id.split('-')[1]))
                .filter((n) => !isNaN(n))
              const classNumber =
                existingNumbers.length > 0
                  ? (Math.max(...existingNumbers) + 1).toString()
                  : '1'
              classId = `${frozenUser.object.uid}-${classNumber}`
            }

            await setDoc(doc(db, classesCollection, classId), newValues)

            await updateInstructorClassMappings(
              classId,
              frozenUser.object.email || '',
              newValues.otherInstructorEmails,
            )

            disabled = true
            submitted = true
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

  function selectClass(classId: string) {
    selectedClassId = classId
    values = instructorClasses[classId]
    if (values.course !== '') {
      submitted = true
    }
    disabled = true
    createClassSchedule = false
    isCreatingNewClass = false
  }

  function createNewClass() {
    selectedClassId = ''
    values = {
      classDay1: '',
      classTime1: '',
      classDay2: '',
      classTime2: '',
      meetingLink: '',
      gradeRecommendation: '',
      course: '',
      submitting: false,
      meetingTimes: [],
      completedClassDates: [],
      feedbackCompleted: [],
      classStatuses: [],
      instructorFirstName: '',
      instructorLastName: '',
      instructorEmail: '',
      otherInstructorEmails: '',
      classCap: 7,
      online: true,
      students: [],
    }
    submitted = false
    disabled = false
    createClassSchedule = true
    isCreatingNewClass = true
  }

  function getMeetingDates(
    classDay1: string,
    classDay2: string,
    classTime1: string,
    classTime2: string,
    startDate: Date,
    endDate: Date,
  ): Date[] {
    const meetingDates = []
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    }

    let currentDate = new Date(startDate.getTime())
    while (currentDate <= endDate) {
      if (currentDate.getDay() === dayMap[classDay1]) {
        let meetingTime = parseTime(classTime1, currentDate)
        meetingDates.push(new Date(meetingTime))
      }
      if (currentDate.getDay() === dayMap[classDay2]) {
        let meetingTime = parseTime(classTime2, currentDate)
        meetingDates.push(new Date(meetingTime))
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return meetingDates
  }

  let instructorClasses: { [classId: string]: Data.Class } = {}
  let selectedClassId = ''
  let availableClassIds: string[] = []

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        const userClasses = await getInstructorClasses(
          user.object.uid,
          user.object.email || '',
        )

        instructorClasses = userClasses
        availableClassIds = Object.keys(instructorClasses).sort()

        if (availableClassIds.length > 0) {
          selectedClassId = availableClassIds[0]
          values = instructorClasses[selectedClassId]
          if (values.course !== '') {
            submitted = true
          }
          disabled = true
          createClassSchedule = false
        }
      }
    })
  })

  function parseTime(time: string, date: Date): Date {
    const [hours, minutes] = time.split(':').map((str) => parseInt(str, 10))
    date.setHours(hours, minutes, 0, 0)
    return date
  }

  function formatIntlDate(date: Date) {
    var month = '' + (date.getMonth() + 1)
    var day = '' + date.getDate()
    var year = date.getFullYear()

    if (month.length < 2) month = '0' + month
    if (day.length < 2) day = '0' + day

    return [year, month, day].join('-')
  }

  async function createLink(newValues: Data.Class): Promise<string> {
    if (newValues.classDay1 === '') {
      alert.trigger(
        'error',
        'Please select at least one class day before creating a meeting link.',
      )
      return ''
    }

    isCreatingLink = true

    const daysOfWeek = [newValues.classDay1]
    if (newValues.classDay2) {
      daysOfWeek.push(newValues.classDay2)
    }

    const event = {
      subject: `${newValues.course} Class Meeting`,
      body: {
        contentType: 'HTML',
        content: `${newValues.course} Class Meeting`,
      },
      start: {
        dateTime: new Date().toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: new Date().toISOString(),
        timeZone: 'UTC',
      },
      recurrence: {
        pattern: {
          type: 'weekly',
          interval: 1,
          daysOfWeek: daysOfWeek,
        },
        range: {
          type: 'numbered',
          startDate: formatIntlDate(new Date(semesterDates.classesStart)),
          numberOfOccurrences: 100,
        },
      },
      location: {
        displayName: 'Online',
      },
      attendees: [],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    }

    try {
      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const tokenData = await tokenRes.json()
      const token = tokenData.access_token

      const eventRes = await fetch(
        'https://graph.microsoft.com/v1.0/users/kendree@gbstem.onmicrosoft.com/calendar/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        },
      )
      const eventData = await eventRes.json()
      alert.trigger('success', 'Meeting link created!')
      isCreatingLink = false
      return eventData.onlineMeeting.joinUrl
    } catch (err) {
      console.error('[ClassDetailsForm] Meeting link creation error:', err)
      alert.trigger('error', 'Failed to create meeting link. Please try again.')
      isCreatingLink = false
      return ''
    }
  }

  // React to parent values changing (e.g. loaded data or cancel changes)
  $: if (values) {
    $form.course = values.course || ''
    $form.gradeRecommendation = values.gradeRecommendation || ''
    $form.classCap = values.classCap || 7
    $form.meetingLink = values.meetingLink || ''
    $form.classDay1 = (values.classDay1 as any) || ''
    $form.classTime1 = values.classTime1 || ''
    $form.classDay2 = (values.classDay2 as any) || ''
    $form.classTime2 = values.classTime2 || ''
    $form.online = values.online !== undefined ? values.online : true
    $form.otherInstructorEmails = values.otherInstructorEmails || ''
    $form.submitting = values.submitting || false
  }
</script>

{#if dialog === true}
  <Dialog bind:this={classDetailsDialogEl} size="full" alert>
    <svelte:fragment slot="title"
      ><div class="flex items-center justify-between">
        Your class details <Button
          color="red"
          class="font-light"
          on:click={classDetailsDialogEl.cancel}>Close</Button
        >
      </div>
    </svelte:fragment>
    <div slot="description">
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
              on:click={() => (disabled = false)}>Edit class details</Button
            >
            <p class="text-sm text-gray-500">
              Note that editing your class details will reset your class
              schedule.
            </p>
          {/if}

          <fieldset class="mt-4 space-y-4" disabled={disabled || $delayed}>
            <p class="text-sm text-gray-600">
              Please do not fill this form out until you have been told by
              gbSTEM leadership what class you will be teaching. Submitting this
              form will generate a meeting link for your class; you can join
              using the 'Join Class' button in the portal.
            </p>

            <!-- Class Management Section -->
            <div class="rounded-lg bg-gray-50 p-4">
              <h3 class="mb-3 text-lg font-semibold">Manage Your Classes</h3>

              <div class="mb-3 flex flex-wrap gap-2">
                {#each availableClassIds as classId}
                  <Button
                    color={selectedClassId === classId ? 'blue' : 'gray'}
                    type="button"
                    on:click={() => selectClass(classId)}
                  >
                    Class {classId.split('-')[1]}
                    {#if instructorClasses[classId]?.course}
                      - {instructorClasses[classId].course}
                    {/if}
                  </Button>
                {/each}

                <Button color="green" type="button" on:click={createNewClass}>
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

            <div class="mt-2 flex flex-col gap-1.5">
              <FormInput
                form={formResult}
                name="otherInstructorEmails"
                label="Enter the emails of any co-instructors here, comma separated. Keep in mind that only one instructor per class should fill out this form."
                bind:value={$form.otherInstructorEmails}
              />
            </div>

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
                name="submitting"
                label="I understand submitting will make my class available for registration, so I should not submit until I am sure the class and class times work for me."
                bind:checked={$form.submitting}
              />
            </div>

            <div class="mt-2 flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name="createClassSchedule"
                label="Would you like a class schedule to be automatically created for you? Typically, you want to check this box the first time you submit your class details, but you should avoid checking this box when submitting the form again to edit your class details because it will overwrite changes you have made to your existing class schedule."
                bind:checked={createClassSchedule}
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
    </div>
  </Dialog>
{:else}
  <form use:enhance class={cn(showValidation && 'show-validation', 'w-full')}>
    {#if disabled}
      <Button
        color="blue"
        class="mb-5"
        type="button"
        on:click={() => (disabled = false)}>Edit class details</Button
      >
      <p class="text-sm text-gray-500">
        Note that editing your class details will reset your class schedule.
      </p>
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
          {#each availableClassIds as classId}
            <Button
              color={selectedClassId === classId ? 'blue' : 'gray'}
              type="button"
              on:click={() => selectClass(classId)}
            >
              Class {classId.split('-')[1]}
              {#if instructorClasses[classId]?.course}
                - {instructorClasses[classId].course}
              {/if}
            </Button>
          {/each}

          <Button color="green" type="button" on:click={createNewClass}>
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

      <div class="mt-2 flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="otherInstructorEmails"
          label="Enter the emails of any co-instructors here, comma separated. Keep in mind that only one instructor per class should fill out this form."
          bind:value={$form.otherInstructorEmails}
        />
      </div>

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
          on:click={async () =>
            ($form.meetingLink = await createLink({ ...values, ...$form }))}
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
          name="submitting"
          label="I understand submitting will make my class available for registration, so I should not submit until I am sure the class and class times work for me."
          bind:checked={$form.submitting}
        />
      </div>

      <div class="mt-2 flex flex-col gap-1.5">
        <FormCheckbox
          form={formResult}
          name="createClassSchedule"
          label="Would you like a class schedule to be automatically created for you? Typically, you want to check this box the first time you submit your class details, but you should avoid checking this box when submitting the form again to edit your class details because it will overwrite changes you have made to your existing class schedule."
          bind:checked={createClassSchedule}
        />
      </div>

      <div class="mt-4 flex justify-end">
        <Button color="blue" type="submit" disabled={$delayed}>Submit</Button>
      </div>
    </fieldset>
  </form>
{/if}
