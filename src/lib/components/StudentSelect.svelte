<script lang="ts">
  import { page } from '$app/state'
  import { user } from '#lib/client/firebase.js'
  import Loading from '#lib/components/Loading.svelte'
  import { registrationService } from '#lib/services/registrationService.js'
  import { selectedStudentIdState } from '#lib/stores.svelte.js'
  import { onMount } from 'svelte'

  interface Props {
    selectedStudentUid?: string
    preloadedStudents?: { uid: string; name: string }[]
  }

  let { selectedStudentUid = $bindable(''), preloadedStudents = [] }: Props =
    $props()

  let fetchedStudents = $state<{ uid: string; name: string }[]>([])
  let fetchingLoading = $state(true)
  let loadError = $state(false)

  const studentsList = $derived(
    preloadedStudents.length > 0 ? preloadedStudents : fetchedStudents,
  )

  const loading = $derived(
    preloadedStudents.length > 0 ? false : fetchingLoading,
  )

  // Students are told apart by uid: two registrations can carry one name.
  // Falls back to the first student when nothing (or a student no longer
  // listed) is selected, and reports the choice to the bound prop and the
  // shared selection.
  $effect(() => {
    if (studentsList.length === 0) return
    if (!studentsList.some((student) => student.uid === selectedStudentUid)) {
      selectedStudentUid = studentsList[0].uid
    }
    selectedStudentIdState.current = selectedStudentUid
  })

  const fetchData = async (user: Data.User.Store) => {
    const uid = user.object.uid
    const slots = await registrationService.fetchChildRegistrationSlots(uid)
    const list: { uid: string; name: string }[] = []
    slots.forEach((slot, index) => {
      if (slot.exists && slot.data?.meta.submitted) {
        const name =
          `${slot.data.personal.studentFirstName} ${slot.data.personal.studentLastName}`.trim() ||
          `Child ${index + 1}`
        list.push({
          uid: slot.uid,
          name,
        })
      }
    })
    fetchedStudents = list
  }

  onMount(() => {
    if (preloadedStudents.length > 0) {
      fetchingLoading = false
      return
    }

    return user.subscribe(async (userData) => {
      if (userData) {
        try {
          if (page.data.user?.role === 'student') {
            await fetchData(userData)
          }
        } catch (err) {
          console.error('[StudentSelect] Failed to load students:', err)
          loadError = true
        } finally {
          fetchingLoading = false
        }
      }
    })
  })

  export const load = () => {
    return {
      props: {
        selectedStudentUid: selectedStudentUid,
      },
    }
  }
</script>

<div class="rounded-lg bg-white p-4 shadow-xs">
  <span class="mb-2 block text-sm font-medium text-gray-700"
    >Select Student</span
  >
  {#if loading}
    <Loading />
  {:else if loadError}
    <div class="text-sm text-red-700">
      Couldn't load your students. Please reload the page.
    </div>
  {:else if studentsList.length === 1}
    <div
      class="rounded-sm bg-blue-50 px-4 py-2 text-center font-semibold text-blue-900"
    >
      {studentsList[0].name}
    </div>
  {:else if studentsList.length === 0}
    <div class="text-gray-500 italic">No students found.</div>
  {:else}
    <div class="relative mt-2 w-full">
      <label for="select-a-child" class="text-sm font-bold">
        <span>Select a child</span>
      </label>
      <select
        id="select-a-child"
        name="select-a-child"
        bind:value={selectedStudentUid}
        class="mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden"
      >
        {#each studentsList as student (student.uid)}
          <option value={student.uid}>{student.name}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
