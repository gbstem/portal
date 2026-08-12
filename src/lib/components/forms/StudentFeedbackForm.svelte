<script lang="ts">
  import { user } from '$lib/client/firebase'
  import { classService } from '$lib/services/classService'
  import { registrationService } from '$lib/services/registrationService'
  import { alert } from '$lib/stores'
  import { selectedStudentIdState } from '$lib/stores.svelte'
  import { cn } from '$lib/utils'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import Loading from '../Loading.svelte'

  let showValidation = false
  let selectedStudentUid = $derived(selectedStudentIdState.current)

  let loading = $state(true)
  let loadError = $state(false)
  let selectedStudentCourses: any[] = $state([])
  let studentName = $state('')

  const schema = z.object({
    classId: z.string().min(1, 'Please select a course'),
    date: z.string().min(1, 'Date of class is required'),
    rating: z.coerce
      .number()
      .int()
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating must be at most 5'),
    feedback: z.string().min(1, 'Feedback is required'),
  })

  const formResult = superForm(
    defaults(
      {
        classId: '',
        date: new Date().toISOString().slice(0, 10),
        rating: 0,
        feedback: '',
      },
      zod(schema as any) as any,
    ) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return

        let instructor = ''
        let course = ''
        selectedStudentCourses.forEach((selectedCourse) => {
          if (selectedCourse.classId === formVal.data.classId) {
            instructor = selectedCourse.instructor
            course = selectedCourse.course
          }
        })

        const submissionValues = {
          studentId: selectedStudentUid,
          date: formVal.data.date,
          classId: formVal.data.classId,
          rating: formVal.data.rating,
          feedback: formVal.data.feedback,
          instructor,
          studentName,
          course,
        }

        if ($user) {
          classService
            .submitStudentFeedback(formVal.data.classId, submissionValues)
            .then(() => {
              alert.trigger('success', 'Class Feedback saved!')
              reset()
            })
            .catch((err) => {
              console.error(
                '[StudentFeedbackForm] Error saving student feedback:',
                err,
              )
              alert.trigger('error', err.code || err.message, true)
            })
        }
      },
    },
  )

  const { form, enhance, reset, errors, submitting } = formResult

  async function fetchCourseList(classIds: string[]) {
    try {
      const courseDocs = await classService.fetchClassesByIds(classIds)
      selectedStudentCourses = courseDocs.map((data) => ({
        classId: data.id,
        course: data.course,
        instructor: data.instructorFirstName + ' ' + data.instructorLastName,
      }))
    } catch (err) {
      console.error('[StudentFeedbackForm] Error fetching course list:', err)
    }
  }

  $effect(() => {
    const currentUid = selectedStudentUid
    if (!currentUid) {
      loading = false
      return
    }
    let cancelled = false
    loading = true
    loadError = false
    ;(async () => {
      try {
        const data = await registrationService.fetchRegistration(currentUid)
        if (cancelled) return
        if (data) {
          studentName =
            data.personal.studentFirstName + ' ' + data.personal.studentLastName
          const classIds = data.classes || []
          await fetchCourseList(classIds)
        } else {
          studentName = ''
          selectedStudentCourses = []
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            '[StudentFeedbackForm] Error fetching student registration:',
            err,
          )
          loadError = true
        }
      } finally {
        if (!cancelled) {
          loading = false
        }
      }
    })()
    return () => {
      cancelled = true
    }
  })
</script>

<form class={cn(showValidation && 'show-validation')} use:enhance>
  <fieldset class="space-y-4" disabled={$submitting}>
    <h2 class="text-lg font-bold">
      Weekly Class Feedback Form{#if studentName}
        For {studentName}{/if}
    </h2>
    {#if loading}
      <div class="py-8">
        <Loading />
      </div>
    {:else if loadError}
      <div class="py-4 text-sm text-red-600">
        Failed to load student course details. Please try again.
      </div>
    {:else if selectedStudentCourses.length == 0}
      <div class="text-sm text-gray-500">
        This student is not currently enrolled in a course.
      </div>
    {:else}
      <div class="mb-5">
        <h3 class="mb-2 text-sm font-bold">Select Course:</h3>
        {#each selectedStudentCourses as { instructor, course, classId } (classId)}
          <label class="mt-1 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              bind:group={$form.classId}
              value={classId}
              class="h-4 w-4"
            />
            {course} (taught by {instructor})
          </label>
        {/each}
        {#if $errors.classId}
          <p class="mt-1 text-xs font-semibold text-red-500">
            {$errors.classId}
          </p>
        {/if}
      </div>

      <div class="grid gap-1">
        <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
          <div class="flex flex-col gap-1.5 sm:col-span-1">
            <FormInput
              form={formResult}
              name="date"
              label="Date of Class"
              type="date"
              bind:value={$form.date}
            />
          </div>
          <div class="flex flex-col gap-1.5 sm:col-span-3">
            <FormInput
              form={formResult}
              name="rating"
              label="Rate the class from 1-5"
              type="number"
              min="1"
              max="5"
              bind:value={$form.rating}
            />
          </div>
        </div>
        <div class="mt-2 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="feedback"
            label="Please provide any written feedback here. This won't be visible to the instructor."
            bind:value={$form.feedback}
          />
        </div>
      </div>
      <div class="justify mt-4 flex">
        <Button color="blue" type="submit" disabled={$submitting}>Submit</Button
        >
      </div>
    {/if}
  </fieldset>
</form>
