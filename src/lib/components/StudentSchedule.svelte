<script lang="ts">
  import { db } from '$lib/client/firebase'
  import { doc, getDoc } from 'firebase/firestore'
  import Button from './Button.svelte'
  import { formatDate, formatDateString, timestampToDate } from '$lib/utils'
  import {
    classesCollection,
    registrationsCollection,
  } from '$lib/data/constants'
  import { getContext, onMount } from 'svelte'
  import { selectedStudentId } from '$lib/stores'

  type ClassDate = { course: string; meetingTime: Date; link: string }
  let classes: ClassDate[] = []
  let nextClass: ClassDate | null = null
  let listView: boolean = false
  let courses = new Set()
  let selectedStudentUid = ''
  let selectedStudentName = ''

  const subscribe = selectedStudentId.subscribe((value) => {
    selectedStudentUid = value
  })

  async function fetchClassSchedules(classIds: string[]) {
    const schedulesPromises = classIds.map((classId) =>
      getDoc(doc(db, classesCollection, classId)),
    )
    let fetchedClasses: ClassDate[] = []
    const schedulesDocs = await Promise.all(schedulesPromises)
    schedulesDocs
      .map(async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = (await docSnapshot.data()) as Data.Class
          courses.add(data.course)
          data.meetingTimes.map((date) => {
            fetchedClasses.push({
              course: data.course,
              meetingTime: timestampToDate(date),
              link: data.meetingLink,
            })
          })
        }
      })
      .flat()
    return fetchedClasses
  }

  $: if (selectedStudentUid) {
    getDoc(doc(db, registrationsCollection, selectedStudentUid)).then(
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data()
          const classIds = data.classes || []
          selectedStudentName = data.personal.studentFirstName
          classes = await fetchClassSchedules(classIds)
          const now = new Date()
          const classesToday = classes.filter(
            (classDate) =>
              classDate.meetingTime.toDateString() === now.toDateString(),
          )
          if (classesToday.length > 0) {
            const futureTodayClasses = classesToday
              .filter(
                (classDate) =>
                  classDate.meetingTime.getHours() >= now.getHours(),
              )
              .sort((a, b) => a.meetingTime.getTime() - b.meetingTime.getTime())
            nextClass =
              futureTodayClasses.length > 0
                ? futureTodayClasses[0]
                : classes
                    .filter((classDate) => classDate.meetingTime > now)
                    .sort(
                      (a, b) =>
                        a.meetingTime.getTime() - b.meetingTime.getTime(),
                    )[0] || null
          } else {
            nextClass =
              classes
                .filter((classDate) => classDate.meetingTime > now)
                .sort(
                  (a, b) => a.meetingTime.getTime() - b.meetingTime.getTime(),
                )[0] || null
          }
        }
      },
    )
  }
</script>

<div class="rounded-lg bg-white p-6 shadow-xs">
  {#if selectedStudentUid}
    {#if classes.length === 0}
      <div class="flex flex-col items-center justify-center py-8">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="mb-4 h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
        <p class="text-lg font-medium text-gray-900">No Classes Found</p>
        <p class="mt-1 text-sm text-gray-500">
          This student is not currently enrolled in any classes.
        </p>
        <a href="/classes">
          <Button color="blue" class="mt-4">Browse Available Classes</Button>
        </a>
      </div>
    {:else}
      <div class="mb-4 font-bold">
        Next Upcoming Class For {selectedStudentName}:
      </div>
      <div class="font-semibold text-blue-700">
        {nextClass === null || nextClass === undefined
          ? 'No Upcoming Classes'
          : nextClass.course + ' ' + formatDate(nextClass.meetingTime)}
      </div>
      {#if nextClass}
        <div class="mb-6">
          <a href={nextClass.link} target="_blank">
            <Button color="blue" class="mt-4">Join Class</Button>
          </a>
        </div>
      {/if}
      <div class="mb-2 font-bold">{selectedStudentName}'s Class Schedule</div>
      <ul class="space-y-3">
        {#each classes as classSession}
          <li
            class="flex items-center rounded-lg bg-blue-50 px-4 py-3 shadow-xs"
          >
            <div class="flex-1">
              <div class="font-semibold text-blue-900">
                {classSession.course}
              </div>
              <div class="text-sm text-gray-700">
                {formatDate(classSession.meetingTime)}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="text-gray-500 italic">
      Please select a student to view their class schedule.
    </p>
  {/if}
</div>

<style>
  /* Add your styles for the schedule items here */
</style>
