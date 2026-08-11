<script lang="ts">
  import { user } from '$lib/client/firebase'
  import Loading from '$lib/components/Loading.svelte'
  import Select from '$lib/components/Select.svelte'
  import { registrationService } from '$lib/services/registrationService'
  import { selectedStudentIdState } from '$lib/stores.svelte'
  import { onMount } from 'svelte'

  interface Props {
    selectedStudent?: string
    selectedStudentUid?: string
    preloadedStudents?: { uid: string; name: string }[]
  }

  let {
    selectedStudent = $bindable(''),
    selectedStudentUid = $bindable(''),
    preloadedStudents = [],
  }: Props = $props()

  let fetchedStudents = $state<{ uid: string; name: string }[]>([])
  let fetchingLoading = $state(true)
  let loadError = $state(false)

  const studentsList = $derived(
    preloadedStudents.length > 0 ? preloadedStudents : fetchedStudents,
  )

  const studentsOptions = $derived(
    studentsList.map((student) => ({
      name: student.name,
    })),
  )

  const nameToUid = $derived(
    studentsList.reduce<Record<string, string>>((acc, student) => {
      acc[student.name] = student.uid
      return acc
    }, {}),
  )

  const loading = $derived(
    preloadedStudents.length > 0 ? false : fetchingLoading,
  )

  $effect(() => {
    // Set the selected student to the first student if available and not already set
    if (studentsOptions.length > 0 && !selectedStudent) {
      selectedStudent = studentsOptions[0].name
    }
  })

  $effect(() => {
    if (selectedStudent && nameToUid[selectedStudent]) {
      const targetUid = nameToUid[selectedStudent]
      if (selectedStudentUid !== targetUid) {
        selectedStudentUid = targetUid
      }
      selectedStudentIdState.current = targetUid
    }
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
          if (userData.profile.role === 'student') {
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
  {:else if studentsOptions.length === 1}
    <div
      class="rounded-sm bg-blue-50 px-4 py-2 text-center font-semibold text-blue-900"
    >
      {studentsOptions[0].name}
    </div>
  {:else if studentsOptions.length === 0}
    <div class="text-gray-500 italic">No students found.</div>
  {:else}
    <Select
      bind:value={selectedStudent}
      options={studentsOptions}
      label="Select a child"
      class="w-full"
    />
  {/if}
</div>
