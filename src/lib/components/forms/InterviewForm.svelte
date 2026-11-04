<script lang="ts">
  import { user } from '#lib/client/firebase.js'
  import { formatInterviewWindow } from '#lib/helpers/interviewForm.js'
  import { openableMeetingLink } from '#lib/helpers/meetingLink.js'
  import {
    interviewService,
    type BookedInterviewDetails,
    type SavedAvailability,
  } from '#lib/services/interviewService.js'
  import AvailabilityGrid from '#lib/shared/AvailabilityGrid.svelte'
  import {
    addWeeks,
    cellInstant,
    cellsInWeek,
    formatShortDay,
    gridPosition,
    isOpenCell,
    rowRange,
    weekColumns,
    weekStart,
    weeksInWindow,
    type CellInfo,
    type CellKey,
  } from '#lib/shared/availabilityGrid.js'
  import { localTimeZoneLabel } from '#lib/shared/gbstemTime.js'
  import {
    INTERVIEW_DURATION_MINUTES,
    type InterviewWindow,
  } from '#lib/shared/interviews.js'
  import { alert } from '#lib/stores.js'
  import { formatDateLocal } from '#lib/utils.js'
  import { onMount, tick } from 'svelte'
  import Button from '../Button.svelte'
  import Link from '../Link.svelte'
  import Loading from '../Loading.svelte'

  const D = INTERVIEW_DURATION_MINUTES
  // Every time on this page is shown in the viewer's own zone; this names it.
  const timeZone = localTimeZoneLabel()

  let loading = $state(true)
  let busy = $state(false)
  let scheduledInterview = $state<BookedInterviewDetails | null>(null)
  let availableTimes: Date[] = $state([])
  let interviewWindow = $state<InterviewWindow | null>(null)
  let saved = $state<SavedAvailability | null>(null)
  // Read when the page loads, and again after each reload of its data.
  let now = $state(new Date())

  /** Booking: choosing a time offered. Painting: saying when they're free. */
  let mode: 'pick' | 'paint' = $state('pick')
  // Showing the calendar to move a booked interview to another time.
  let rescheduling = $state(false)
  let pickedTime = $state<Date | null>(null)
  // Every painted time, by epoch milliseconds, across all weeks.
  let painted = $state(new Set<number>())

  let root: HTMLElement | undefined = $state()
  // The fixed nav's height (h-20), which covers the top of the viewport.
  const NAV_HEIGHT = 80

  /**
   * Switches to painting. The open-times grid is tall enough that its button
   * sits well below the card's heading, so once the instructions change the
   * page scrolls back to that heading, if it has gone out of view, to show
   * the card is now asking something else. The heading is the enclosing
   * `[data-scroll-anchor]` (the dashboard's Interview card) or else this
   * form's own.
   */
  async function startPainting() {
    mode = 'paint'
    await tick()
    const anchor = root?.closest<HTMLElement>('[data-scroll-anchor]') ?? root
    if (anchor && anchor.getBoundingClientRect().top < NAV_HEIGHT) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  let weeks = $derived(
    interviewWindow
      ? weeksInWindow(interviewWindow).filter((week) => addWeeks(week, 1) > now)
      : [],
  )
  let weekIndex = $state(0)
  let week = $derived(weeks[Math.min(weekIndex, weeks.length - 1)])

  const inWeek = (date: Date, w: Date) => date >= w && date < addWeeks(w, 1)

  let offeredCells = $derived(
    week
      ? cellsInWeek(
          availableTimes.map((date) => ({ date })),
          week,
          D,
        )
      : new Map<CellKey, { date: Date }[]>(),
  )

  let cells = $derived.by(() => {
    const result: Record<CellKey, CellInfo> = {}
    for (const key of offeredCells.keys()) {
      result[key] = {
        tone: 'offered',
        label: 'Open',
        title: 'An interview time you can book',
        pickable: true,
      }
    }
    return result
  })

  // This week's painted cells, and the setter that writes them back.
  let weekPainted = $derived.by(() => {
    const keys = new Set<CellKey>()
    if (!week) return keys
    for (const ms of painted) {
      const date = new Date(ms)
      if (inWeek(date, week)) keys.add(gridPosition(date, D).key)
    }
    return keys
  })

  function setWeekPainted(keys: Set<CellKey>) {
    if (!week || !interviewWindow) return
    const next = new Set(
      [...painted].filter((ms) => !inWeek(new Date(ms), week)),
    )
    for (const key of keys) {
      if (isOpenCell(week, key, interviewWindow, now)) {
        next.add(cellInstant(week, key).getTime())
      }
    }
    painted = next
  }

  let rows = $derived(
    rowRange(
      [...availableTimes, ...[...painted].map((ms) => new Date(ms))].filter(
        (date) => week && inWeek(date, week),
      ),
    ),
  )

  let pickedKey = $derived(
    pickedTime && week && inWeek(pickedTime, week)
      ? gridPosition(pickedTime, D).key
      : null,
  )

  // Painted times an interviewer already offers: those can just be booked.
  // By row, since a slot added one at a time can start between rows.
  let paintedAndOffered = $derived.by(() => {
    const offeredRows = new Set(
      availableTimes.map((time) => {
        const { week: w, key } = gridPosition(time, D)
        return cellInstant(w, key).getTime()
      }),
    )
    return [...painted].filter((ms) => offeredRows.has(ms)).length
  })
  let paintedCount = $derived(
    [...painted].filter((ms) => ms > now.getTime()).length,
  )

  /** The first week with something in it, to open on. */
  function firstUsefulWeek(times: Date[]): number {
    const first = times.find((time) => time > now)
    if (!first) return 0
    const index = weeks.findIndex(
      (w) => w.getTime() === weekStart(first).getTime(),
    )
    return Math.max(index, 0)
  }

  async function load() {
    const result = await interviewService.fetchInterviewData()
    now = new Date()
    scheduledInterview = result.scheduledInterview
    availableTimes = result.availableTimes
    interviewWindow = result.interviewWindow
    saved = result.availability
    painted = new Set(saved?.times.map((time) => time.getTime()) ?? [])
    pickedTime = null
    weekIndex = firstUsefulWeek(
      availableTimes.length ? availableTimes : (saved?.times ?? []),
    )
  }

  onMount(() =>
    user.subscribe(async (current) => {
      if (!current) return
      try {
        await load()
      } catch (err) {
        console.error('[InterviewForm] Error loading interview times:', err)
        alert.trigger('error', 'Failed to load interview times.')
      }
      loading = false
    }),
  )

  function pick(key: CellKey) {
    pickedTime = offeredCells.get(key)?.[0]?.date ?? null
  }

  async function book() {
    if (!pickedTime) return
    busy = true
    try {
      scheduledInterview = await interviewService.bookInterview(pickedTime, {
        reschedule: rescheduling,
      })
      rescheduling = false
      window.scrollTo({ top: 0, behavior: 'smooth' })
      alert.trigger(
        'success',
        'Thank you for signing up for an interview! You will receive an email with the details shortly.',
      )
    } catch (err: any) {
      console.error('[InterviewForm] Booking error:', err)
      alert.trigger('error', err.message || 'Failed to book interview')
      // Whatever was refused, the times on screen may be out of date.
      const keepRescheduling = rescheduling
      await load().catch(() => {})
      rescheduling = keepRescheduling
    } finally {
      busy = false
    }
  }

  async function cancel() {
    if (
      !confirm(
        'Cancel your interview? Your interviewer will be told, and you can book another time.',
      )
    ) {
      return
    }
    busy = true
    try {
      await interviewService.cancelInterview()
      alert.trigger(
        'success',
        'Your interview has been canceled. Please book another time.',
      )
      await load()
    } catch (err: any) {
      console.error('[InterviewForm] Cancel error:', err)
      alert.trigger('error', err.message || 'Failed to cancel your interview')
    } finally {
      busy = false
    }
  }

  async function saveAvailability() {
    busy = true
    try {
      const kept = await interviewService.saveAvailability(
        [...painted].map((ms) => new Date(ms)),
      )
      saved = kept.length ? { times: kept, updated: new Date() } : null
      painted = new Set(kept.map((time) => time.getTime()))
      mode = 'pick'
      window.scrollTo({ top: 0, behavior: 'smooth' })
      alert.trigger(
        'success',
        kept.length
          ? "Thanks! We've let our interviewers know when you're free. You'll get an email when one schedules your interview."
          : 'Your availability has been cleared.',
      )
    } catch (err: any) {
      console.error('[InterviewForm] Save availability error:', err)
      alert.trigger('error', err.message || 'Failed to save your availability')
    } finally {
      busy = false
    }
  }

  let upcoming = $derived(
    scheduledInterview?.interviewSlotStatus === 'pending' &&
      scheduledInterview.at > now,
  )
</script>

{#snippet weekNav()}
  <div class="mb-2 flex flex-wrap items-center gap-2">
    <Button
      type="button"
      disabled={weekIndex <= 0}
      onclick={() => (weekIndex = Math.max(0, weekIndex - 1))}
      >← Previous week</Button
    >
    <span class="text-sm font-semibold" data-testid="interview-week"
      >Week of {week ? formatShortDay(week) : ''}</span
    >
    <Button
      type="button"
      disabled={weekIndex >= weeks.length - 1}
      onclick={() => (weekIndex = Math.min(weeks.length - 1, weekIndex + 1))}
      >Next week →</Button
    >
  </div>
{/snippet}

{#snippet calendar()}
  <p
    class="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900"
  >
    Times shown in your local time ({timeZone}). Interviews usually take about {D}
    minutes.
  </p>
  {#if interviewWindow}
    <p class="mb-3 text-sm text-gray-700">
      Interviews run {formatInterviewWindow(interviewWindow)} (Eastern time).
    </p>
  {/if}

  {#if !weeks.length || !interviewWindow || !week}
    <div
      class="rounded-md border border-red-200 bg-red-100 px-4 py-2 text-red-900 shadow-xs"
    >
      The interview window has closed. Please contact gbSTEM if you still need
      an interview.
    </div>
  {:else if mode === 'pick'}
    {@const window = interviewWindow}
    {#if availableTimes.length === 0}
      <div
        class="mb-3 rounded-md border border-red-200 bg-red-100 px-4 py-2 text-red-900 shadow-xs"
      >
        There are no interview times open right now. Tell us when you're free
        and an interviewer will schedule you.
      </div>
    {:else}
      <p class="mb-3 text-sm text-gray-600">
        Choose an open time, then confirm it. If none of them work, tell us when
        you're free instead.
      </p>
      {@render weekNav()}
      <AvailabilityGrid
        label="Open interview times, week of {formatShortDay(week)}"
        mode="pick"
        columns={weekColumns(week, window, now)}
        {rows}
        durationMinutes={D}
        {cells}
        picked={pickedKey}
        onpick={pick}
      />
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          color="blue"
          disabled={!pickedTime || busy}
          onclick={book}
        >
          {#if pickedTime}
            {rescheduling ? 'Move my interview to' : 'Book'}
            {formatDateLocal(pickedTime)}
          {:else}
            Choose a time above
          {/if}
        </Button>
      </div>
    {/if}

    {#if !rescheduling}
      {#if saved}
        <p class="mt-6 text-sm text-gray-700" data-testid="saved-availability">
          You've told our interviewers you're free at {saved.times.length}
          time{saved.times.length === 1 ? '' : 's'} (last updated
          {formatDateLocal(saved.updated)}).
        </p>
      {/if}
      <Button
        type="button"
        color="blue"
        class="mt-4 block"
        onclick={startPainting}
      >
        {saved ? 'Edit when I’m free' : 'None of these work for me'}
      </Button>
    {/if}
  {:else}
    {@const window = interviewWindow}
    {@const shown = week}
    <p class="mb-3 text-sm text-gray-600">
      Drag across every time you're free, in each week you can make. Our
      interviewers will pick one of them and email you. Saving replaces what you
      told us before.
    </p>
    {@render weekNav()}
    <AvailabilityGrid
      label="Your availability, week of {formatShortDay(shown)}"
      mode="paint"
      columns={weekColumns(shown, window, now)}
      {rows}
      durationMinutes={D}
      {cells}
      isDisabled={(key) => !isOpenCell(shown, key, window, now)}
      bind:selected={() => weekPainted, setWeekPainted}
    />
    <p class="mt-3 text-sm" data-testid="painted-count">
      {paintedCount} time{paintedCount === 1 ? '' : 's'} painted, across all weeks.
    </p>
    {#if paintedAndOffered}
      <p
        class="mt-2 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-900"
        data-testid="offered-nudge"
      >
        {paintedAndOffered} of the times you painted
        {paintedAndOffered === 1 ? 'is' : 'are'} open to book right now (marked "Open").
        You can book one straight away instead.
      </p>
    {/if}
    <div class="mt-4 flex flex-wrap gap-2">
      <Button
        type="button"
        color="blue"
        disabled={busy}
        onclick={saveAvailability}>Save my availability</Button
      >
      <Button
        type="button"
        disabled={busy}
        onclick={() => {
          painted = new Set(saved?.times.map((time) => time.getTime()) ?? [])
          mode = 'pick'
        }}>Back to open times</Button
      >
    </div>
  {/if}
{/snippet}

<div class="scroll-mt-24 ps-4" bind:this={root}>
  {#if loading}
    <Loading />
  {:else if scheduledInterview && upcoming && !rescheduling}
    <div
      class="rounded-md border border-green-200 bg-green-100 px-4 py-2 text-center text-green-900 shadow-xs"
    >
      <p class="font-bold">
        Your interview will be on {scheduledInterview.date} with
        {scheduledInterview.interviewerName}.
      </p>
      <p class="mt-1 text-sm">
        It usually takes about {D} minutes. Times shown in your local time ({timeZone}).
      </p>
      {#if openableMeetingLink(scheduledInterview.meetingLink)}
        <p class="mt-2 text-sm">
          Your interview meeting link is <Link
            href={openableMeetingLink(scheduledInterview.meetingLink)}
            target="_blank"
            rel="noopener">{scheduledInterview.meetingLink}</Link
          >.
        </p>
      {:else if scheduledInterview.meetingLink}
        <p class="mt-2 text-sm font-medium text-red-600">
          Invalid meeting link. Please contact gbSTEM support.
        </p>
      {/if}
      <p class="mt-1 text-xs text-gray-600">
        Please check your inbox for an email with interview details.
      </p>
    </div>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button
        type="button"
        color="blue"
        disabled={busy}
        onclick={() => {
          rescheduling = true
          mode = 'pick'
          pickedTime = null
        }}>Reschedule</Button
      >
      <Button type="button" color="red" disabled={busy} onclick={cancel}
        >Cancel my interview</Button
      >
    </div>
  {:else if scheduledInterview && !upcoming && !rescheduling}
    <div
      class="rounded-md border border-green-200 bg-green-100 px-4 py-2 text-center font-bold text-green-900 shadow-xs"
    >
      Your interview was on {scheduledInterview.date}.
    </div>
  {:else}
    <h2 class="mb-2 text-lg font-bold">
      {#if rescheduling}
        Choose a new interview time
      {:else if mode === 'paint'}
        When are you free?
      {:else}
        Available Interview Times
      {/if}
    </h2>
    {#if rescheduling}
      <p class="mb-3 text-sm text-gray-700">
        Your interview on {scheduledInterview?.date} stays booked until you confirm
        a new time.
        <button
          type="button"
          class="text-blue-700 underline"
          onclick={() => (rescheduling = false)}>Keep my current time</button
        >
      </p>
    {/if}
    {@render calendar()}
  {/if}
</div>
