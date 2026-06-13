<script lang="ts">
  import ApplyForm from '$lib/components/forms/ApplyForm.svelte'
  import { db, user } from '$lib/client/firebase'
  import RegistrationForm from '$lib/components/forms/RegistrationForm.svelte'
  import Button from '$lib/components/Button.svelte'
  import Select from '$lib/components/Select.svelte'
  import Card from '$lib/components/Card.svelte'
  import { getDoc, doc } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import { alert } from '$lib/stores'
  import {
    registrationsCollection,
    semesterDatesDocument,
  } from '$lib/data/collections'

  // if this is a registration, iterate through the user's uid and check if uid-1, uid-2, etc. exists
  // if it does, add it to the options array
  // if it doesn't, break out of the loop

  let options: { name: string }[] = []
  const nameToUid: Record<string, string> = {}
  let value = ''
  let ready = false
  let uid = ''
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
    parentOrientation: '',
    registrationsOpen: '',
  }

  const fetchData = async (user: Data.User.Store) => {
    uid = user.object.uid
    await getDoc(doc(db, 'semesterDates', semesterDatesDocument)).then(
      (datesDoc) => {
        const datesDocExists = datesDoc.exists()
        if (datesDocExists) {
          semesterDates = datesDoc.data() as Data.SemesterDates
        }
      },
    )
    for (let i = 1; i < 6; ++i) {
      const docRef = await getDoc(
        doc(db, registrationsCollection, `${uid}-${i}`),
      )
      if (docRef.exists()) {
        const name =
          `${docRef.data().personal.studentFirstName} ${
            docRef.data().personal.studentLastName
          }`.trim() || `Child ${i}`
        options.push({
          name,
        })
        nameToUid[name] = `${uid}-${i}`
      } else {
        break
      }
    }
    if (options.length === 0) {
      options.push({
        name: `Child 1`,
      })
      nameToUid[`Child 1`] = `${uid}-1`
    }
    // set the selected student to the first student
    value = options[0].name
    ready = true
  }

  const addChild = () => {
    if (options.length >= 5) {
      alert.trigger('error', 'You can only register up to 5 children')
      return
    }
    const newChildNumber = options.length + 1
    const newChildName = `Child ${newChildNumber}`

    // Update options array
    options = [...options, { name: newChildName }]
    nameToUid[newChildName] = `${uid}-${newChildNumber}`

    // Set the new child as the selected value
    value = newChildName
  }

  onMount(() => {
    return user.subscribe((user) => {
      if (user) {
        fetchData(user)
      }
    })
  })
</script>

<svelte:head>
  <title>Apply</title>
</svelte:head>

{#if $user?.profile.role === 'instructor'}
  <h1 class="mb-4 text-5xl font-bold md:text-6xl">Apply</h1>
  <div class="mx-auto flex max-w-6xl flex-col items-center px-2 py-8 md:px-8">
    <ApplyForm {semesterDates} />
  </div>
{:else}
  <h1 class="mb-4 text-5xl font-bold md:text-6xl">Student Account Creation</h1>
  <div class="mx-auto flex max-w-6xl flex-col items-center px-2 py-8 md:px-8">
    <div class="w-full">
      {#if ready}
        <div class="font-bold">Your Existing Accounts</div>
        <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
          <div class="sm:col-span-2">
            {#each [options] as optionList (optionList.length)}
              <Select
                bind:value
                class="mr-2 w-full"
                label="Select a child"
                {options}
              />
            {/each}
          </div>
          <div class="flex justify-end">
            <Button
              on:click={addChild}
              color="blue"
              class="px-2 py-1"
              type="button">Add Child Account</Button
            >
          </div>
        </div>
      {/if}
      {#if nameToUid[value]}
        <!-- <div class="rounded-lg bg-red-100 p-4 mt-8 w-full text-center"> This form is not available yet. Student account creation for this semester will open on {semesterDates.newInstructorAppsOpen}!</div> -->
        <Card class="mx-auto mt-4 w-fit">
          <RegistrationForm childUid={nameToUid[value]} {semesterDates} />
        </Card>
      {/if}
    </div>
  </div>
{/if}
