<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import { alert, selectedStudentId } from '$lib/stores'
  import Form from '$lib/components/Form.svelte'
  import Button from '../Button.svelte'
  import Input from '$lib/components/Input.svelte'
  import { cn } from '$lib/utils'
  import { doc, getDoc, setDoc } from 'firebase/firestore'
  import Card from '../Card.svelte'
  import StudentSelect from '../StudentSelect.svelte'
  import {
    classesCollection,
    registrationsCollection,
    studentFeedbackCollection,
  } from '$lib/data/constants'

  let disabled = false
  let showValidation = false
  let selectedStudentUid = ''

  const subscribe = selectedStudentId.subscribe((value) => {
    selectedStudentUid = value
  })

  let selectedStudentCourses: any[] = []
  let pastSelected = ''

  let values: {
    studentId: string
    date: string
    classId: string
    rating: number
    feedback: string
    instructor: string
    studentName: string
    course: string
  } = {
    studentId: '',
    date: new Date().toISOString().slice(0, 10),
    classId: '',
    rating: 0,
    feedback: '',
    instructor: '',
    studentName: '',
    course: '',
  }

  async function fetchCourseList(classIds: string[]) {
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
  }

  function handleSubmit(e: CustomEvent<SubmitData>) {
    selectedStudentCourses.map((selectedCourse) => {
      if (selectedCourse.classId === values.classId) {
        values.instructor = selectedCourse.instructor
        values.course = selectedCourse.course
      }
    })
    values.studentId = selectedStudentUid
    if (e.detail.error === null) {
      showValidation = false
      disabled = false
      if ($user) {
        setDoc(
          doc(db, studentFeedbackCollection, `${values.classId}-${Date.now()}`),
          values,
        )
          .then(() => {
            alert.trigger('success', 'Class Feedback saved!')
          })
          .catch((err) => {
            disabled = false
            alert.trigger('error', err.code, true)
          })
        values.classId = ''
        values.rating = 0
        values.feedback = ''
        values.date = new Date().toISOString().slice(0, 10)
      }
    } else {
      showValidation = true
      alert.trigger('error', e.detail.error)
    }
  }

  $: if (selectedStudentUid) {
    if (selectedStudentUid !== pastSelected || pastSelected === '') {
      getDoc(doc(db, registrationsCollection, selectedStudentUid)).then(
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            values.studentName =
              docSnapshot.data().personal.studentFirstName +
              ' ' +
              docSnapshot.data().personal.studentLastName
            const classIds = docSnapshot.data().classes || []
            fetchCourseList(classIds)
          }
        },
      )
      pastSelected = selectedStudentUid
    }
  }
</script>

<Form class={cn(showValidation && 'show-validation')} on:submit={handleSubmit}>
  {#if disabled}
    <Button color="blue" class="mb-5" on:click={() => (disabled = false)}
      >Edit class feedback</Button
    >
  {:else}
    <fieldset class="space-y-4" {disabled}>
      <h2 class="font-bold">
        Weekly Class Feedback Form{' '}{#if values.studentName}
          For {values.studentName}{/if}
      </h2>
      {#if selectedStudentCourses.length == 0}
        <div>This student is not currently enrolled in a course.</div>
      {:else}
        <div class="mb-5">
          <h2 class="text-lg font-bold">Select Course:</h2>
          {#each selectedStudentCourses as { instructor, course, classId }}
            <label>
              <input type="radio" bind:group={values.classId} value={classId} />
              {course} (taught by {instructor})
            </label>
            <br />
          {/each}
        </div>

        <div class="grid gap-1">
          <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
            <div class="sm:col-span-1">
              <Input
                type="date"
                bind:value={values.date}
                label="Date of Class"
                required
              />
            </div>
            <div class="sm:col-span-3">
              <Input
                type="number"
                bind:value={values.rating}
                min="1"
                max="5"
                label="Rate the class from 1-5"
                required
              />
            </div>
          </div>
          <Input
            type="text"
            bind:value={values.feedback}
            label="Please provide any written feedback here. This won't be visible to the instructor and will be given to the course curriculum developer and track directors to help improve the class and train our instructors."
            required
          />
        </div>
        <div class="justify flex">
          <Button color="blue" type="submit">Submit</Button>
        </div>
      {/if}
    </fieldset>
  {/if}
</Form>
