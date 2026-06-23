<script lang="ts">
  import type { CommunityServiceRequestBody } from '../../../api/communityService/+server'
  import { db, user } from '$lib/client/firebase'
  import Button from '$lib/components/Button.svelte'
  import Card from '$lib/components/Card.svelte'
  import InterviewForm from '$lib/components/forms/InterviewForm.svelte'
  import { ClassStatus } from '$lib/components/helpers/ClassStatus'
  import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
  import {
    classesCollection,
    substituteRequestsCollection,
  } from '$lib/data/collections'
  import { timestampToDate, getInstructorClasses } from '$lib/utils'
  import { collection, doc, getDoc, getDocs, query } from 'firebase/firestore'
  import { alert } from '$lib/stores'

  let numHours = 0
  let numRegHours = 0
  let numSubHours = 0
  let currentUser: Data.User.Store
  let year: number = new Date().getFullYear()
  let isFall = false
  let course = ''

  user.subscribe(async (user) => {
    if (user) {
      currentUser = user
      // Get all classes for this instructor using helper function
      const userClasses = await getInstructorClasses(
        user.object.uid,
        user.object.email || '',
      )

      let courses: string[] = []
      let totalRegHours = 0

      Object.entries(userClasses).forEach(([classId, data]) => {
        const classHours = data.classStatuses.filter(
          (classStatus) =>
            classStatus === ClassStatus.EverythingComplete ||
            classStatus === ClassStatus.FeedbackIncomplete,
        ).length
        totalRegHours += classHours
        courses.push(data.course)

        // Use the first class to determine semester info
        if (course === '' && data.meetingTimes.length > 0) {
          const startDate = timestampToDate(data.meetingTimes[0])
          isFall = startDate.getMonth() > 6
          year = startDate.getFullYear()
        }
      })

      numRegHours = totalRegHours
      numHours = numHours + numRegHours
      if (courses.length > 1) {
        course = courses.join(', ')
      } else if (courses.length === 1) {
        course = courses[0]
      }

      // Then get substitute hours
      const q = query(collection(db, substituteRequestsCollection))
      const subDocs = await getDocs(q)
      subDocs.forEach((doc) => {
        const data = doc.data() as Data.SubRequest
        if (
          data.subInstructorId === user.object.uid &&
          data.subRequestStatus === SubRequestStatus.NoSubstituteNeeded
        ) {
          numHours = numHours + 1
          numSubHours = numSubHours + 1
        }
      })
    }
  })

  function sendEmail() {
    const payload: CommunityServiceRequestBody = {
      firstName: currentUser.profile.firstName,
      hours: numRegHours * 1.25 + numSubHours * 1.5,
      season: (isFall ? 'fall' : 'spring') as 'fall' | 'spring',
      course: course,
      email: currentUser.object.email || '',
      year: year,
      presidents: 'Kendree Chen, Dea Pance, and Michael Bolgov',
    }
    fetch('/api/communityService', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).then((response) => {
      if (response.ok) {
        alert.trigger('success', 'Email sent successfully!')
      } else {
        alert.trigger('error', 'Failed to send email.')
      }
    })
  }
</script>

<svelte:head>
  <title>Community Service Hours Tracker</title>
</svelte:head>

<h1 class="mb-4 text-5xl font-bold md:text-6xl">
  Community Service Hours Tracker
</h1>

<div class="mx-auto max-w-6xl px-2 py-8 md:px-8">
  <div class="relative w-full">
    <Card>
      <div class="p-2">
        <h2 class="text-lg font-bold">
          You have completed {numHours} classes equaling {numRegHours * 1.25 +
            numSubHours * 1.5} total hours (including prep time) of community service
          this year!
        </h2>
        <div>
          You have completed <strong>{numRegHours * 1.25}</strong>
          hour{numRegHours * 1.25 === 1 ? '' : 's'} of instruction for your class
          and <strong>{numSubHours * 1.5}</strong> hour{numSubHours * 1.5 === 1
            ? ''
            : 's'} as a substitute instructor. Thank you for contributing to gbSTEM.
        </div>
        <Button
          color="blue"
          class="mt-2"
          on:click={sendEmail}
          disabled={!currentUser}>Get Hours Confirmation Email</Button
        >
      </div>
    </Card>
  </div>
</div>
