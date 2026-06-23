<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import {
    classesCollection,
    instructorFeedbackCollection,
    registrationsCollection,
    substituteRequestsCollection,
  } from '$lib/data/collections'
  import { alert } from '$lib/stores'
  import { cn } from '$lib/utils'
  import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import Button from '../Button.svelte'
  import Card from '../Card.svelte'
  import FormInput from '../FormInput.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'
  import { ClassStatus } from '../helpers/ClassStatus'
  import { SubRequestStatus } from '../helpers/SubRequestStatus'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  export let classBeingSubbed: Data.SubRequest | undefined
  export let sessionNumber: number
  export let classId: string | undefined = undefined

  let showValidation = false
  let currentUser: Data.User.Store
  let loading = true
  let feedbackCompletedArray: boolean[] = []
  let classStatusesArray: string[] = []

  let classList: string[] = []

  const schema = z.object({
    classDate: z.string().min(1, 'Date of class is required'),
    classNumber: z.coerce
      .number()
      .int()
      .min(1, 'Class session number must be at least 1'),
    feedback: z.string().min(1, 'Reflection/feedback is required'),
    attendanceList: z.record(z.object({ present: z.boolean().default(false) })),
  })

  const formResult = superForm(
    defaults(
      {
        classDate: '',
        classNumber:
          sessionNumber !== undefined
            ? sessionNumber
            : classBeingSubbed === undefined
              ? 1
              : classBeingSubbed.classNumber,
        feedback: '',
        attendanceList: {},
      },
      zod(schema as any) as any,
    ) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      dataType: 'json',
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          let id =
            classBeingSubbed === undefined
              ? classId || frozenUser.object.uid
              : classBeingSubbed.id.split('---')[0]

          const submissionValues = {
            date: formVal.data.classDate,
            feedback: formVal.data.feedback,
            attendanceList: formVal.data.attendanceList,
            courseName: classBeingSubbed?.course || '',
            classNumber: formVal.data.classNumber,
            instructorName:
              classBeingSubbed === undefined
                ? frozenUser.profile.firstName +
                  ' ' +
                  frozenUser.profile.lastName
                : classBeingSubbed.subInstructorFirstName,
          }

          if (
            formVal.data.classNumber - 1 < 0 ||
            formVal.data.classNumber - 1 >= feedbackCompletedArray.length
          ) {
            alert.trigger('error', 'Invalid class number.')
            return
          }

          feedbackCompletedArray[formVal.data.classNumber - 1] = true
          classStatusesArray[formVal.data.classNumber - 1] =
            ClassStatus.EverythingComplete

          try {
            await setDoc(
              doc(db, instructorFeedbackCollection, `${id}-${Date.now()}`),
              submissionValues,
            )
            await updateDoc(doc(db, classesCollection, id), {
              feedbackCompleted: feedbackCompletedArray,
              classStatuses: classStatusesArray,
            })
            if (classBeingSubbed !== undefined) {
              await updateDoc(
                doc(db, substituteRequestsCollection, classBeingSubbed.id),
                { subRequestStatus: SubRequestStatus.NoSubstituteNeeded },
              )
            }
            alert.trigger('success', 'Class Feedback saved!')
            setTimeout(() => location.reload(), 1000)
          } catch (error: any) {
            console.error(
              '[InstructorFeedbackForm] Instructor feedback save error:',
              error,
            )
            alert.trigger(
              'error',
              error.message || 'Error saving feedback',
              true,
            )
          }
        }
      },
    },
  )

  const { form, enhance, delayed, submitting } = formResult

  user.subscribe(async (user) => {
    if (user) {
      currentUser = user
      try {
        await getData()
      } catch (err) {
        console.error(
          '[InstructorFeedbackForm] Error fetching initial data:',
          err,
        )
        alert.trigger('error', 'Failed to load class details.')
      }
      loading = false
    }
  })

  async function getData() {
    let id =
      classBeingSubbed === undefined
        ? classId || currentUser.object.uid
        : classBeingSubbed.id.split('---')[0]
    const document = await getDoc(doc(db, classesCollection, id))
    if (document.exists()) {
      const data = document.data() as Data.Class
      const { students, feedbackCompleted, classStatuses } = data
      const uids = students
      feedbackCompletedArray = feedbackCompleted
      classStatusesArray = classStatuses
      const classListPromises = uids.map(async (uid: string) => {
        try {
          const userDoc = await getDoc(doc(db, registrationsCollection, uid))
          const userData = userDoc.data()?.personal
          return `${userData['studentFirstName']} ${userData['studentLastName']}`
        } catch (error) {
          console.error('Error fetching student data:', error)
          return 'Error'
        }
      })
      try {
        const list = await Promise.all(classListPromises)
        classList = list
        const initialAttendance: Record<string, { present: boolean }> = {}
        classList.forEach((student: string) => {
          initialAttendance[student] = { present: false }
        })
        $form.attendanceList = initialAttendance
      } catch (error) {
        console.error('Error with class list:', error)
      }
    }
  }
</script>

<Card class="sticky top-2 z-50 flex max-w-2xl flex-col gap-3 p-3 md:p-3">
  <hr class="mt-5 mb-3" />
  <form class={cn(showValidation && 'show-validation')} use:enhance>
    <fieldset disabled={$submitting || loading}>
      <h2 class="mt-6 mb-4 text-lg font-bold">Class Information</h2>
      <div class="grid gap-1 sm:grid-cols-2 sm:gap-2">
        <div class="flex flex-col gap-1.5 sm:col-span-1">
          <FormInput
            form={formResult}
            name="classDate"
            label="Date of Class"
            type="date"
            bind:value={$form.classDate}
          />
        </div>
        <div class="flex flex-col gap-1.5 sm:col-span-1">
          <FormInput
            form={formResult}
            name="classNumber"
            label="Class Session Number"
            type="number"
            bind:value={$form.classNumber}
          />
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="feedback"
          label="Reflect on how the class went. What went well? What could be improved? This will be shared with your course curriculum developer and track directors."
          bind:value={$form.feedback}
        />
      </div>

      <hr class="mt-5 mb-3" />

      <h2 class="mb-2 text-lg font-bold">Class Attendance</h2>
      <div class="mt-2 space-y-2">
        {#each classList as student}
          {#if $form.attendanceList[student]}
            <div class="flex flex-col gap-1.5">
              <FormCheckbox
                form={formResult}
                name={`attendanceList.${student}.present`}
                label={student}
                bind:checked={$form.attendanceList[student].present}
              />
            </div>
          {/if}
        {/each}
      </div>

      <div class="justify m-3 mt-5 flex">
        <Button color="blue" type="submit" disabled={$submitting}>Submit</Button
        >
      </div>
    </fieldset>
  </form>
</Card>
