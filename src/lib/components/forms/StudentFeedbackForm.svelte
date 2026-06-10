<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import { alert, selectedStudentId } from '$lib/stores'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import { cn } from '$lib/utils'
  import { doc, getDoc, setDoc } from 'firebase/firestore'
  import Card from '../Card.svelte'
  import {
    classesCollection,
    registrationsCollection,
    studentFeedbackCollection,
  } from '$lib/data/constants'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  let disabled = false
  let showValidation = false
  let selectedStudentUid = ''

  selectedStudentId.subscribe((value) => {
    selectedStudentUid = value
  })

  let selectedStudentCourses: any[] = []
  let pastSelected = ''
  let studentName = ''

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
        disabled = true

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
          setDoc(
            doc(
              db,
              studentFeedbackCollection,
              `${formVal.data.classId}-${Date.now()}`,
            ),
            submissionValues,
          )
            .then(() => {
              disabled = false
              alert.trigger('success', 'Class Feedback saved!')
              reset()
            })
            .catch((err) => {
              console.error(
                '[StudentFeedbackForm] Error saving student feedback:',
                err,
              )
              disabled = false
              alert.trigger('error', err.code || err.message, true)
            })
        } else {
          disabled = false
        }
      },
    },
  )

  const { form, enhance, delayed, reset, errors } = formResult

  async function fetchCourseList(classIds: string[]) {
    try {
      const coursePromises = classIds.map((classId) =>
        getDoc(doc(db, classesCollection, classId)),
      )
      const courseDocs = await Promise.all(coursePromises)
      selectedStudentCourses = courseDocs
        .map((doc) => {
          if (doc.exists() && doc.data()) {
            return {
              classId: doc.id,
              course: doc.data().course,
              instructor:
                doc.data().instructorFirstName +
                ' ' +
                doc.data().instructorLastName,
            }
          }
        })
        .filter(Boolean)
    } catch (err) {
      console.error('[StudentFeedbackForm] Error fetching course list:', err)
    }
  }

  $: if (selectedStudentUid) {
    if (selectedStudentUid !== pastSelected || pastSelected === '') {
      getDoc(doc(db, registrationsCollection, selectedStudentUid))
        .then((docSnapshot) => {
          if (docSnapshot.exists()) {
            studentName =
              docSnapshot.data().personal.studentFirstName +
              ' ' +
              docSnapshot.data().personal.studentLastName
            const classIds = docSnapshot.data().classes || []
            fetchCourseList(classIds)
          }
        })
        .catch((err) => {
          console.error(
            '[StudentFeedbackForm] Error fetching student registration:',
            err,
          )
        })
      pastSelected = selectedStudentUid
    }
  }
</script>

<form class={cn(showValidation && 'show-validation')} use:enhance>
  {#if disabled}
    <Button
      color="blue"
      class="mb-5"
      type="button"
      on:click={() => (disabled = false)}>Edit class feedback</Button
    >
  {:else}
    <fieldset class="space-y-4" disabled={disabled || $delayed}>
      <h2 class="text-lg font-bold">
        Weekly Class Feedback Form{#if studentName}
          For {studentName}{/if}
      </h2>
      {#if selectedStudentCourses.length == 0}
        <div class="text-sm text-gray-500">
          This student is not currently enrolled in a course.
        </div>
      {:else}
        <div class="mb-5">
          <h3 class="mb-2 text-sm font-bold">Select Course:</h3>
          {#each selectedStudentCourses as { instructor, course, classId }}
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
          <Button color="blue" type="submit" disabled={$delayed}>Submit</Button>
        </div>
      {/if}
    </fieldset>
  {/if}
</form>
