<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import {
    applicationsCollection,
    interviewCollection,
  } from '$lib/data/constants'
  import { alert } from '$lib/stores'
  import { formatDateLocal, timestampToDate } from '$lib/utils'
  import { cn } from '$lib/utils'
  import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
  } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import type { InterviewRequestBody } from '../../../routes/api/interview/+server'
  import type { SlotRequestRequestBody } from '../../../routes/api/slotRequest/+server'
  import Link from '../Link.svelte'
  import Loading from '../Loading.svelte'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  export let semesterDates: Data.SemesterDates

  let showValidation = false
  let valuesJson: Data.InterviewSlot[] = []
  let scheduledInterview: Data.InterviewSlot
  let currentUser: Data.User.Store
  let scheduled = false
  let data: Data.InterviewSlot[] = []
  let loading = true
  let showRequestNewTime = false

  const bookingSchema = z.object({
    slotId: z.string().min(1, 'Please select an interview slot'),
  })

  const requestSchema = z.object({
    dateToAdd: z.string().min(1, 'Please select a date and time'),
  })

  const bookingFormResult = superForm(
    defaults({ slotId: '' }, zod(bookingSchema as any) as any) as any,
    {
      SPA: true,
      validators: zod(bookingSchema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        const slot = valuesJson.find((s) => s.id === formVal.data.slotId)
        if (!slot) return

        try {
          // get the doc for the interview again to confirm that it is still available
          const docRef = doc(db, interviewCollection, slot.id)
          const docSnap = await getDoc(docRef)
          // check that interviewSlotStatus is still available
          if (docSnap.data()?.interviewSlotStatus !== 'available') {
            alert.trigger(
              'error',
              'The interview slot you selected is no longer available. Please select another slot.',
            )
            return
          }

          slot.interviewSlotStatus = 'pending'
          scheduledInterview = slot
          scheduled = true

          // update application to indicate interview scheduled
          await updateDoc(
            doc(db, applicationsCollection, currentUser.object.uid),
            {
              'meta.interview': true,
            },
          )

          await updateDoc(doc(db, interviewCollection, slot.id), {
            interviewSlotStatus: slot.interviewSlotStatus,
            intervieweeFirstName: currentUser.profile.firstName,
            intervieweeLastName: currentUser.profile.lastName,
            intervieweeEmail: currentUser.object.email,
            intervieweeId: currentUser.object.uid,
          })

          const payload: InterviewRequestBody = {
            email: slot.interviewerEmail,
            date: slot.date,
            link: slot.meetingLink,
            interviewer: slot.interviewerName,
            firstName: currentUser.profile.firstName,
          }

          const res = await fetch('/api/interview', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const { message } = await res.json().catch(() => ({}))
            console.error(
              '[InterviewForm] Email notification send error:',
              message || 'Unknown error',
            )
          }
          window.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
          alert.trigger(
            'success',
            'Thank you for signing up for an interview! You will receive an email with the details shortly.',
          )
        } catch (err: any) {
          console.error('[InterviewForm] Booking error:', err)
          alert.trigger('error', err.message || 'Failed to book interview')
        }
      },
    },
  )

  const requestFormResult = superForm(
    defaults(
      { dateToAdd: '2024-09-20T12:00' },
      zod(requestSchema as any) as any,
    ) as any,
    {
      SPA: true,
      validators: zod(requestSchema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        const dateToAdd = formVal.data.dateToAdd
        if (
          new Date(dateToAdd) > new Date(semesterDates.instructorOrientation)
        ) {
          alert.trigger(
            'error',
            'Instructor interviews close on ' +
              semesterDates.instructorOrientation +
              '. Please pick a time before then.',
          )
          return
        }

        try {
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
          const payload: SlotRequestRequestBody = {
            firstName: currentUser.profile.firstName,
            intervieweeEmail: currentUser.object.email || '',
            timeSlot: formatDateLocal(new Date(dateToAdd)),
          }
          const res = await fetch('/api/slotRequest', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const { message } = await res.json()
            console.error('Interview slot request failed:', message)
          }
          window.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
          showRequestNewTime = false
          alert.trigger(
            'success',
            `Thank you for requesting a new timeslot! We will add new times soon, and you will be notified if your slot is created.`,
          )
        } catch (err: any) {
          console.error('[InterviewForm] Request slot error:', err)
          alert.trigger('error', err.message || 'Failed to request timeslot')
        }
      },
    },
  )

  const {
    form: bookingForm,
    enhance: bookingEnhance,
    delayed: bookingDelayed,
    errors: bookingErrors,
  } = bookingFormResult
  const {
    form: requestForm,
    enhance: requestEnhance,
    delayed: requestDelayed,
  } = requestFormResult

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        currentUser = user
        try {
          data = await getData()
        } catch (err) {
          console.error('[InterviewForm] Error loading interview slots:', err)
          alert.trigger('error', 'Failed to load interview slots.')
        }
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
        <h2 class="font-bold text-lg mb-2">Available Interview Slots</h2>

        <form
          class={cn(
            'max-w-2xl',
            showValidation && 'show-validation',
            'space-y-4',
          )}
          use:bookingEnhance
        >
          {#if value.length === 0}
            <div
              class="rounded-md bg-red-100 px-4 py-2 text-red-900 shadow-xs border border-red-200"
            >
              There are no interview slots available currently. Please request a
              new time to be added that works for you. You may request multiple
              times.
            </div>
          {:else}
            <div class="text-sm text-gray-600">
              Please sign up for one of the following interview slots. If none
              of them work for you, please request a new time to be added. You
              may request multiple times.
            </div>
          {/if}

          {#if value.length > 0}
            <div class="mb-4">
              <div class="grid grid-cols-2 gap-2">
                {#each value as val}
                  <label
                    class="flex items-center gap-2 text-sm mt-1 cursor-pointer"
                  >
                    <input
                      type="radio"
                      bind:group={$bookingForm.slotId}
                      value={val.id}
                      class="h-4 w-4"
                    />
                    {val.date} ({val.interviewerName})
                  </label>
                {/each}
              </div>
              {#if $bookingErrors.slotId}
                <p class="text-xs text-red-500 font-semibold mt-1">
                  {$bookingErrors.slotId}
                </p>
              {/if}
            </div>
            <Button type="submit" color="blue" disabled={$bookingDelayed}>
              Submit
            </Button>
          {/if}
        </form>

        {#if showRequestNewTime}
          <form class={cn('max-w-2xl mt-4 space-y-4')} use:requestEnhance>
            <div class="flex flex-col gap-1.5 mt-2">
              <FormInput
                form={requestFormResult}
                name="dateToAdd"
                label="Set Date (your local time)"
                type="datetime-local"
                bind:value={$requestForm.dateToAdd}
              />
            </div>

            <Button type="submit" color="blue" disabled={$requestDelayed}>
              Submit
            </Button>
          </form>
        {:else}
          <Button
            type="button"
            on:click={() => (showRequestNewTime = true)}
            color="blue"
            class="mt-4 block"
          >
            Request A Time
          </Button>
        {/if}
      {:else if scheduledInterview.interviewSlotStatus === 'pending'}
        <div
          class="rounded-md bg-green-100 px-4 py-2 text-center text-green-900 shadow-xs border border-green-200"
        >
          <p class="font-bold">
            Your interview will be on {scheduledInterview.date} with
            {scheduledInterview.interviewerName}.
          </p>
          <p class="mt-2 text-sm">
            Your interview meeting link is <Link
              href={scheduledInterview.meetingLink}
              target="_blank"
              rel="noopener">{scheduledInterview.meetingLink}</Link
            >.
          </p>

          <p class="mt-1 text-xs text-gray-600">
            Please check your inbox for an email with interview details.
          </p>
        </div>
      {:else}
        <div
          class="rounded-md bg-green-100 px-4 py-2 text-center text-green-900 shadow-xs border border-green-200 font-bold"
        >
          Your interview was on {scheduledInterview.date}.
        </div>
      {/if}
    {/await}
  {/if}
</div>
