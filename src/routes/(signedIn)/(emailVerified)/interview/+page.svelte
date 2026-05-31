<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import InterviewForm from '$lib/components/forms/InterviewForm.svelte'
  import PageLayout from '$lib/components/PageLayout.svelte'
  import { semesterDatesDocument } from '$lib/data/constants'
  import { getDoc, doc } from 'firebase/firestore'

  let semesterDates: Data.SemesterDates = {
    classesEnd: '',
    classesStart: '',
    leadershipAppsDue: '',
    newInstructorAppsDue: '',
    returningInstructorAppsDue: '',
    instructorOrientation: '',
    newInstructorAppsOpen: '',
    returningInstructorAppsOpen: '',
    studentOrientation: '',
    registrationsDue: '',
    registrationsOpen: '',
    parentOrientation: '',
  }

  user.subscribe((user) => {
    if (user) {
      getDoc(doc(db, 'semesterDates', semesterDatesDocument)).then(
        (datesDoc) => {
          const datesDocExists = datesDoc.exists()
          if (datesDocExists) {
            semesterDates = datesDoc.data() as Data.SemesterDates
          }
        },
      )
    }
  })
</script>

<svelte:head>
  <title>Schedule Your Interview</title>
</svelte:head>

<PageLayout cols={2}>
  <svelte:fragment slot="title">Schedule Your Interview</svelte:fragment>
  <div class="relative w-full">
    <InterviewForm {semesterDates} />
  </div>
</PageLayout>
