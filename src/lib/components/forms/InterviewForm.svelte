<script lang="ts">
  import { user } from '#lib/client/firebase.js'
  import {
    interviewService,
    type BookedInterviewDetails,
    type InterviewSlotOption,
  } from '#lib/services/interviewService.js'
  import { alert } from '#lib/stores.js'
  import {
    formatInterviewWindow,
    validateRequestedInterviewTime,
  } from '#lib/helpers/interviewForm.js'
  import { cn, toLocalISOString } from '#lib/utils.js'
  import { localTimeZoneLabel } from '#lib/shared/gbstemTime.js'
  import {
    INTERVIEW_DURATION_MINUTES,
    type InterviewWindow,
  } from '#lib/shared/interviews.js'
  import { onMount } from 'svelte'
  import Link from '../Link.svelte'
  import { openableMeetingLink } from '#lib/helpers/meetingLink.js'
  import Loading from '../Loading.svelte'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  let showValidation = false
  let scheduledInterview: BookedInterviewDetails | undefined = $state()
  let scheduled = $state(false)
  let data: InterviewSlotOption[] = $state([])
  let loading = $state(true)
  let showRequestNewTime = $state(false)
  // The window the server accepts a time request in, sent with the slots.
  let interviewWindow: InterviewWindow | undefined = $state()

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

        try {
          // Booked in a transaction server-side, so a slot another applicant
          // has just taken is refused with a message rather than double-booked.
          scheduledInterview = await interviewService.bookInterviewSlot(
            formVal.data.slotId,
          )
          scheduled = true
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
          // Whatever was refused, the list on screen may be out of date.
          data = await getData()
        }
      },
    },
  )

  // The picker's `min` and `max`: from now, or from when interviews open if
  // later, to the last minute of the window. `now` is read once at mount:
  // this form is opened, used, and dismissed in one sitting, so it doesn't
  // need to track the clock.
  const now = new Date()
  let earliestRequestableTime = $derived(
    toLocalISOString(
      interviewWindow && interviewWindow.opens > now
        ? interviewWindow.opens
        : now,
    ),
  )
  let latestRequestableTime = $derived(
    interviewWindow
      ? toLocalISOString(new Date(interviewWindow.closes.getTime() - 60_000))
      : undefined,
  )
  // Every time on this page is shown in the viewer's own zone; this names it.
  const timeZone = localTimeZoneLabel()

  // Deliberately empty rather than pre-filled. A pre-filled datetime invites
  // submitting it unread, and this field used to default to a hardcoded
  // '2024-09-20T12:00' -- which passed validation (the only date guard was an
  // upper bound), so a candidate who clicked straight through filed a request
  // for a date two years past. Interviewers never saw it: the admin request
  // list only renders requests that are upcoming or less than 30 days old.
  const requestFormResult = superForm(
    defaults({ dateToAdd: '' }, zod(requestSchema as any) as any) as any,
    {
      SPA: true,
      validators: zod(requestSchema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        const dateToAdd = formVal.data.dateToAdd
        // `min` and `max` on the input are a convenience, not a control --
        // they are trivially bypassed, so this is the check, and
        // /api/slotRequest repeats it.
        const invalidReason = interviewWindow
          ? validateRequestedInterviewTime(dateToAdd, interviewWindow)
          : null
        if (invalidReason) {
          alert.trigger('error', invalidReason)
          return
        }

        try {
          await interviewService.requestInterviewSlot(dateToAdd)
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
    const result = await interviewService.fetchInterviewData()
    interviewWindow = result.interviewWindow
    if (result.scheduledInterview) {
      scheduledInterview = result.scheduledInterview
      scheduled = true
    }
    return result.availableSlots
  }
</script>

<div class="ps-4">
  {#if loading}
    <Loading />
  {:else}
    {#await data then value}
      {#if scheduled === false}
        <h2 class="mb-2 text-lg font-bold">Available Interview Slots</h2>
        <p class="mb-4 text-sm font-medium text-gray-700">
          Times shown in your local time ({timeZone}). Interviews usually take
          about {INTERVIEW_DURATION_MINUTES} minutes.
        </p>

        <form
          novalidate
          class={cn(
            'max-w-2xl',
            showValidation && 'show-validation',
            'space-y-4',
          )}
          use:bookingEnhance
        >
          {#if value.length === 0}
            <div
              class="rounded-md border border-red-200 bg-red-100 px-4 py-2 text-red-900 shadow-xs"
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
                {#each value as val (val.id)}
                  <label
                    class="mt-1 flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      bind:group={$bookingForm.slotId}
                      value={val.id}
                      class="size-4"
                    />
                    {val.date} ({val.interviewerName})
                  </label>
                {/each}
              </div>
              {#if $bookingErrors.slotId}
                <p class="mt-1 text-xs font-semibold text-red-500">
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
          <form
            novalidate
            class={cn('mt-4 max-w-2xl space-y-4')}
            use:requestEnhance
          >
            {#if interviewWindow}
              <p class="text-sm text-gray-700">
                Interviews run {formatInterviewWindow(interviewWindow)} (Eastern time).
              </p>
            {/if}
            <div class="mt-2 flex flex-col gap-1.5">
              <FormInput
                form={requestFormResult}
                name="dateToAdd"
                label="Set Date (your local time, {timeZone})"
                type="datetime-local"
                min={earliestRequestableTime}
                max={latestRequestableTime}
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
            onclick={() => (showRequestNewTime = true)}
            color="blue"
            class="mt-4 block"
          >
            Request A Time
          </Button>
        {/if}
      {:else if scheduledInterview?.interviewSlotStatus === 'pending'}
        <div
          class="rounded-md border border-green-200 bg-green-100 px-4 py-2 text-center text-green-900 shadow-xs"
        >
          <p class="font-bold">
            Your interview will be on {scheduledInterview?.date} with
            {scheduledInterview?.interviewerName}.
          </p>
          <p class="mt-1 text-sm">
            It usually takes about {INTERVIEW_DURATION_MINUTES} minutes.
          </p>
          {#if openableMeetingLink(scheduledInterview?.meetingLink)}
            <p class="mt-2 text-sm">
              Your interview meeting link is <Link
                href={openableMeetingLink(scheduledInterview?.meetingLink)}
                target="_blank"
                rel="noopener">{scheduledInterview?.meetingLink}</Link
              >.
            </p>
          {:else if scheduledInterview?.meetingLink}
            <p class="mt-2 text-sm font-medium text-red-600">
              Invalid meeting link. Please contact gbSTEM support.
            </p>
          {/if}

          <p class="mt-1 text-xs text-gray-600">
            Please check your inbox for an email with interview details.
          </p>
        </div>
      {:else}
        <div
          class="rounded-md border border-green-200 bg-green-100 px-4 py-2 text-center font-bold text-green-900 shadow-xs"
        >
          Your interview was on {scheduledInterview?.date}.
        </div>
      {/if}
    {/await}
  {/if}
</div>
