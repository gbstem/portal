<script lang="ts">
  import {
    collection,
    query,
    getDocs,
    updateDoc,
    doc,
    getDoc,
    setDoc,
  } from 'firebase/firestore'
  import { db, user } from '$lib/client/firebase'
  import Form from '$lib/components/Form.svelte'
  import clsx from 'clsx'
  import { alert } from '$lib/stores'
  import Card from '../Card.svelte'
  import Link from '../Link.svelte'
  import { onMount } from 'svelte'
  import Loading from '../Loading.svelte'
  import Input from '$lib/components/Input.svelte'
  import { formatDateLocal, timestampToDate } from '$lib/utils'
  import { applicationsCollection } from '$lib/data/constants'
  import { interviewCollection } from '$lib/data/constants'
  import { last } from 'lodash-es'

  export let semesterDates: Data.SemesterDates

  let showValidation = false
  let valuesJson: Data.InterviewSlot[] = []
  let scheduledInterview: Data.InterviewSlot
  let currentUser: Data.User.Store
  let scheduled = false
  let data: Data.InterviewSlot[] = []
  let loading = true
  let showRequestNewTime = false
  let dateToAdd = '9/20/24'

  async function sendSlotRequest() {
    if (new Date(dateToAdd) > new Date(semesterDates.instructorOrientation)) {
      alert.trigger(
        'error',
        'Instructor interviews close on ' +
          semesterDates.instructorOrientation +
          '. Please pick a time before then.',
      )
      return
    }
    await setDoc(
      doc(
        db,
        'interviewTimeRequests',
        currentUser.object.uid + '-' + dateToAdd,
      ),
      {
        firstName: currentUser.profile.firstName,
        lastName: currentUser.profile.lastName,
        email: currentUser.object.email,
        date: new Date(dateToAdd),
      },
    )
    await fetch('/api/slotRequest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: currentUser.profile.firstName,
        intervieweeEmail: currentUser.object.email,
        timeSlot: formatDateLocal(new Date(dateToAdd)),
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const { message } = await res.json()
        console.log(message)
      }
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    })
    showRequestNewTime = false
    alert.trigger(
      'success',
      `Thank you for requesting a new timeslot! We will add new times soon, and you will be notified if your slot is created. If you do not receive an email within a few days, please check back here soon to find another slot that works for you.`,
    )
  }

  async function handleSubmit() {
    // get the doc for the interview again to confirm that it is still available
    const docRef = doc(db, interviewCollection, scheduledInterview.id)
    const docSnap = await getDoc(docRef)
    // check that interviewSlotStatus is still available
    if (docSnap.data()?.interviewSlotStatus !== 'available') {
      alert.trigger(
        'error',
        'The interview slot you selected is no longer available. Please select another slot.',
      )
      return
    }
    scheduledInterview.interviewSlotStatus = 'pending'
    scheduled = true

    // update application to indicate interview scheduled
    updateDoc(doc(db, applicationsCollection, currentUser.object.uid), {
      'meta.interview': true,
    })

    updateDoc(doc(db, interviewCollection, scheduledInterview.id), {
      interviewSlotStatus: scheduledInterview.interviewSlotStatus,
      intervieweeFirstName: currentUser.profile.firstName,
      intervieweeLastName: currentUser.profile.lastName,
      intervieweeEmail: currentUser.object.email,
      intervieweeId: currentUser.object.uid,
    })
    fetch('/api/interview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: scheduledInterview.interviewerEmail,
        date: scheduledInterview.date,
        link: scheduledInterview.meetingLink,
        interviewer: scheduledInterview.interviewerName,
        firstName: currentUser.profile.firstName,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const { message } = await res.json()
        console.log(message)
      }
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    })
    alert.trigger(
      'success',
      'Thank you for signing up for an interview! You will receive an email with the details shortly.',
    )
  }

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        currentUser = user
        data = await getData()
        // const semesterDatesDoc = await getDoc(doc(db, 'data', 'semesterDates')).then((semesterData) => {
        //   const data = semesterData.data()
        //   if(data) dueDate = data.instructorOrientation
        // })
        loading = false
      }
    })
  })

  async function getData() {
    const q = query(collection(db, interviewCollection))
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((doc) => {
      const interviewInfo = doc.data()
      if (
        interviewInfo['intervieweeId'] === currentUser.object.uid &&
        timestampToDate(interviewInfo['date']) >
          new Date(semesterDates.returningInstructorAppsOpen)
      ) {
        scheduledInterview = {
          ...interviewInfo,
          id: doc.id,
          date: formatDateLocal(new Date(interviewInfo['date'].seconds * 1000)),
          interviewSlotStatus:
            new Date(interviewInfo['date'].seconds * 1000) < new Date()
              ? 'completed'
              : interviewInfo['interviewSlotStatus'],
        } as Data.InterviewSlot
        scheduled = true
      } else {
        const interviewDate = new Date(interviewInfo['date'].seconds * 1000)
        const inFourHours = new Date(new Date().getTime() + 4 * 60 * 60 * 1000)
        if (
          interviewInfo['interviewSlotStatus'] === 'available' &&
          interviewDate > inFourHours &&
          interviewDate < new Date(semesterDates.instructorOrientation)
        ) {
          valuesJson.push({
            ...interviewInfo,
            id: doc.id,
            date: formatDateLocal(
              new Date(interviewInfo['date'].seconds * 1000),
            ),
          } as Data.InterviewSlot)
        }
      }
    })
    // Sort by date
    valuesJson.sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
    return valuesJson
  }
</script>

<div class="ps-4">
  {#if loading}
    <Loading />
  {:else}
    {#await data then value}
      {#if scheduled === false}
        <h2 class="font-bold">Available Interview Slots</h2>

        <Form
          class={clsx('max-w-2xl', showValidation && 'show-validation')}
          on:submit={handleSubmit}
        >
          {#if value.length === 0}
            <div class="rounded-md bg-red-100 px-4 py-2 text-red-900 shadow-sm">
              There are no interview slots available currently. Please request a
              new time to be added that works for you. You may request multiple
              times.
            </div>
          {:else}
            <div>
              Please sign up for one of the following interview slots. If none
              of them work for you, please request a new time to be added. You
              may request multiple times.
            </div>
          {/if}
          <div class="mb-4">
            <div class="grid grid-cols-2 gap-2">
              {#each value as val}
                <label>
                  <input
                    type="radio"
                    bind:group={scheduledInterview}
                    value={val}
                  />
                  {val.date} ({val.interviewerName})
                </label>
              {/each}
            </div>
          </div>
          <button
            type="submit"
            class="rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-sm transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
            >Submit</button
          >
          {#if showRequestNewTime}
            <Form
              class={clsx('max-w-2xl', showValidation && 'show-validation')}
              on:submit={sendSlotRequest}
            >
              <Input
                type="datetime-local"
                bind:value={dateToAdd}
                label="Set Date (your local time)"
              />

              <button
                type="submit"
                class="mt-2 rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-sm transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
                >Submit</button
              >
            </Form>
          {:else}
            <button
              type="button"
              on:click={() => (showRequestNewTime = true)}
              class="rounded-md bg-blue-100 px-4 py-2 text-blue-900 shadow-sm transition-colors duration-300 hover:bg-blue-200 disabled:bg-blue-200 disabled:text-blue-500"
              >Request A Time</button
            >
          {/if}
        </Form>
      {:else if scheduledInterview.interviewSlotStatus === 'pending'}
        <div
          class="rounded-md bg-green-100 px-4 py-2 text-center text-green-900 shadow-sm"
        >
          <p>
            Your interview will be on {scheduledInterview.date} with
            {scheduledInterview.interviewerName}.
          </p>
          <p>
            Your interview meeting link is <Link
              href={scheduledInterview.meetingLink}
              target="_blank"
              rel="noopener">{scheduledInterview.meetingLink}</Link
            >.
          </p>

          <p>Please check your inbox for an email with interview details.</p>
        </div>
      {:else}
        <div
          class="rounded-md bg-green-100 px-4 py-2 text-center text-green-900 shadow-sm"
        >
          Your interview was on {scheduledInterview.date}.
        </div>
      {/if}
    {/await}
  {/if}
</div>
