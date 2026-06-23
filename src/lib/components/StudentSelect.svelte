<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import Loading from '$lib/components/Loading.svelte'
  import Select from '$lib/components/Select.svelte'
  import {
    maxChildrenPerAccount,
    registrationsCollection,
  } from '$lib/data/collections'
  import { selectedStudentId } from '$lib/stores'
  import { doc, getDoc } from 'firebase/firestore'
  import { onMount } from 'svelte'

  let loading = true

  let studentsOptions: { name: string }[] = []
  export let selectedStudent = ''
  export let selectedStudentUid = ''
  export let preloadedStudents: { uid: string; name: string }[] = []
  const nameToUid: Record<string, string> = {}

  const initializeFromPreloadedData = () => {
    studentsOptions = preloadedStudents.map((student) => ({
      name: student.name,
    }))
    preloadedStudents.forEach((student) => {
      nameToUid[student.name] = student.uid
    })

    // Set the selected student to the first student if available
    if (studentsOptions.length > 0 && !selectedStudent) {
      selectedStudent = studentsOptions[0].name
    }
    loading = false
  }

  const fetchData = async (user: Data.User.Store) => {
    const uid = user.object.uid
    for (let i = 1; i <= maxChildrenPerAccount; ++i) {
      const docRef = await getDoc(
        doc(db, registrationsCollection, `${uid}-${i}`),
      )
      if (docRef.exists() && docRef.data()?.meta.submitted) {
        const name =
          `${docRef.data().personal.studentFirstName} ${
            docRef.data().personal.studentLastName
          }`.trim() || `Child ${i}`
        studentsOptions.push({
          name,
        })
        nameToUid[name] = `${uid}-${i}`
      }
    }
  }

  $: if (selectedStudent) {
    const selectedStudentRegistration = studentsOptions.find(
      (option) => option.name === selectedStudent,
    )
    if (selectedStudentRegistration) {
      selectedStudentUid = nameToUid[selectedStudentRegistration.name]
      selectedStudentId.set(selectedStudentUid)
    }
  }

  $: if (preloadedStudents.length > 0) {
    initializeFromPreloadedData()
  }

  onMount(() => {
    // If we have preloaded data, use it immediately
    if (preloadedStudents.length > 0) {
      initializeFromPreloadedData()
    } else {
      // Fall back to original logic if no preloaded data
      return user.subscribe(async (userData) => {
        if (userData) {
          if (userData && userData.profile.role === 'student') {
            await fetchData(userData)
          }
          // set the selected student to the first student
          if (studentsOptions.length > 0) {
            selectedStudent = studentsOptions[0].name
          }
          loading = false
        }
      })
    }
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
