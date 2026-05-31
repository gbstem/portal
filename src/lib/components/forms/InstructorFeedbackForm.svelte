<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import { alert } from '$lib/stores'
  import Form from '$lib/components/Form.svelte'
  import Button from '../Button.svelte'
  import Input from '$lib/components/Input.svelte'
  import { cn } from '$lib/utils'
  import {
    doc,
    setDoc,
    query,
    collection,
    getDocs,
    getDoc,
    updateDoc,
  } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import {
    classesCollection,
    instructorFeedbackCollection,
    registrationsCollection,
    substituteRequestsCollection,
  } from '$lib/data/constants'
  import Dialog from '../Dialog.svelte'
  import Card from '../Card.svelte'
  import { SubRequestStatus } from '../helpers/SubRequestStatus'
  import { valuesIn } from 'lodash-es'
  import { ClassStatus } from '../helpers/ClassStatus'

  // export let feedbackDialogEl: Dialog
  export let classBeingSubbed: Data.SubRequest | undefined
  export let sessionNumber: number
  export let classId: string | undefined = undefined

  let disabled = false
  let showValidation = false
  let currentUser: Data.User.Store
  let loading = true
  let classDate = ''
  let classNumber =
    sessionNumber !== undefined
      ? sessionNumber
      : classBeingSubbed === undefined
        ? 0
        : classBeingSubbed.classNumber
  let course = ''
  let feedbackCompletedArray: boolean[] = []
  let classStatusesArray: string[] = []
  let values: {
    date: string
    feedback: string
    attendanceList: Record<string, { present: boolean }>
    courseName: string
    instructorName: string
    classNumber: number
  } = {
    date: '',
    feedback: '',
    attendanceList: {},
    courseName: '',
    instructorName: '',
    classNumber: 0,
  }

  let classList: string[] = []

  user.subscribe(async (user) => {
    if (user) {
      currentUser = user
      getData()
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
      const classListPromises = uids.map((uid: string) =>
        getDoc(doc(db, registrationsCollection, uid))
          .then((userDoc) => {
            const userData = userDoc.data()?.personal
            return `${userData['studentFirstName']} ${userData['studentLastName']}`
          })
          .catch((error) => {
            console.error('Error fetching student data:', error)
            return 'Error' // Or handle the error as appropriate
          }),
      )
      Promise.all(classListPromises)
        .then((list) => {
          classList = list
          values.courseName = data.course
          values.classNumber =
            classBeingSubbed === undefined ? 0 : classBeingSubbed.classNumber
          values.instructorName =
            classBeingSubbed === undefined
              ? currentUser.profile.firstName +
                ' ' +
                currentUser.profile.lastName
              : classBeingSubbed.subInstructorFirstName
          classList.forEach((student: string) => {
            values.attendanceList[student] = {
              present: false,
            }
          })
        })
        .catch((error) => {
          // Handle any errors that occurred during Promise.all
          console.error('Error with class list:', error)
        })
    }
    return classList
  }

  function handleSubmit() {
    if ($user) {
      const frozenUser = $user
      let id =
        classBeingSubbed === undefined
          ? classId || frozenUser.object.uid
          : classBeingSubbed.id.split('---')[0]
      if (classDate === '') {
        alert.trigger('error', 'Please enter class date.')
      } else {
        disabled = true
        values.date = classDate
        values.classNumber = classNumber
        if (
          classNumber - 1 < 0 ||
          classNumber - 1 >= feedbackCompletedArray.length
        ) {
          alert.trigger('error', 'Invalid class number.')
          return
        }
        feedbackCompletedArray[classNumber - 1] = true
        classStatusesArray[classNumber - 1] = ClassStatus.EverythingComplete
        setDoc(
          doc(db, instructorFeedbackCollection, `${id}-${Date.now()}`),
          values,
        ).catch((error) => {
          console.log(error)
        })
        updateDoc(doc(db, classesCollection, id), {
          feedbackCompleted: feedbackCompletedArray,
          classStatuses: classStatusesArray,
        })
        if (classBeingSubbed !== undefined) {
          updateDoc(
            doc(db, substituteRequestsCollection, classBeingSubbed.id),
            { subRequestStatus: SubRequestStatus.NoSubstituteNeeded },
          )
        }
        alert.trigger('success', 'Class Feedback saved!')
        setTimeout(() => location.reload(), 1000)
      }
    }
  }
</script>

<!-- <Dialog bind:this={feedbackDialogEl} size="full" alert>
  <svelte:fragment slot="title"><div class = "flex justify-between items-center">{course} {classBeingSubbed !== undefined ? 'Substitute' : 'Weekly'} Class Feedback Form <Button color = 'red' class="font-light" on:click={feedbackDialogEl.cancel}>Close</Button></div> </svelte:fragment>
  <div slot="description"> -->
<Card class="sticky top-2 z-50 flex justify-between gap-3 p-3 md:p-3">
  <hr class="mb-3 mt-5" />
  <Form
    class={cn(showValidation && 'show-validation')}
    on:submit={() => {
      handleSubmit()
    }}
  >
    <h2 class="mb-4 mt-6 font-bold">Class Information</h2>
    <div class="grid gap-1 sm:grid-cols-2 sm:gap-2">
      <div class="sm:col-span-1">
        <Input
          type="date"
          bind:value={classDate}
          floating
          label="Date of Class"
          required
        />
      </div>
      <div class="sm:col-span-1">
        <Input
          type="number"
          bind:value={classNumber}
          floating
          label="Class Session Number"
          required
        />
      </div>
    </div>
    <Input
      type="text"
      bind:value={values.feedback}
      label="Reflect on how the class went. What went well? What could be improved? This will be shared with your course curriculum developer and track directors to help improve the class."
    />
    <hr class="mb-3 mt-5" />

    <h2 class="font-bold">Class Attendance</h2>
    {#each classList as student}
      <fieldset class="space-y-4">
        <div class="grid gap-1">
          <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
            <div class="sm:col-span-3">
              <Input
                type="checkbox"
                bind:value={values.attendanceList[student].present}
                label={student}
              />
            </div>
          </div>
        </div>
      </fieldset>
    {/each}
    <div class="justify m-3 mt-5 flex">
      <Button color="blue" type="submit">Submit</Button>
    </div>
  </Form>
</Card>
<!-- </div>
</Dialog> -->
