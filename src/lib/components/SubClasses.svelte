<script lang="ts">
  import { enhance } from '$app/forms'
  import { user } from '$lib/client/firebase'
  import { filterCheckedOffSubClasses } from '$lib/helpers/subClasses'
  import { classService } from '$lib/services/classService'
  import { substituteService } from '$lib/services/substituteService'
  import { alert } from '$lib/stores'
  import { formatDate, timestampToDate } from '$lib/utils'
  import { onMount } from 'svelte'
  import Button from './Button.svelte'
  import Card from './Card.svelte'
  import DateTimeInput from './DateTimeInput.svelte'
  import Dialog from './Dialog.svelte'
  import NumberInput from './NumberInput.svelte'
  import TextInput from './TextInput.svelte'
  import InstructorFeedbackForm from './forms/InstructorFeedbackForm.svelte'
  import { SubRequestStatus } from './helpers/SubRequestStatus'
  import { curriculums } from './helpers/curriculum'
  import sendClassReminder from './helpers/sendClassReminder'

  interface Props {
    subInstructor: boolean
  }

  let { subInstructor }: Props = $props()

  let feedbackOpenStates: boolean[] = $state([])
  let notesOpenStates: boolean[] = $state([])
  let subRequestOpenStates: boolean[] = $state([])
  let currentUser: Data.User.Store
  let classesMissingSubs: Data.SubRequest[] = $state([])
  let userSubClassesList: Data.SubRequest[] = $state([])
  let classesCheckedOff: any[] = $state([])
  let updating = $state(false)
  let subRequestsFromUser: Data.SubRequest[] = $state([])
  let stringSubRequestDates: string[] = $state([])
  let originalSubClassNumbers: number[] = $state([])

  // Sized to match userSubClassesList/subRequestsFromUser so bind:open
  // never binds to undefined (Svelte forbids that when the prop has a
  // fallback value). Runs pre-DOM-update so a growing list is backfilled
  // before the {#each} blocks below re-render.
  $effect.pre(() => {
    for (
      let i = feedbackOpenStates.length;
      i < userSubClassesList.length;
      i++
    ) {
      feedbackOpenStates[i] = false
    }
    for (let i = notesOpenStates.length; i < userSubClassesList.length; i++) {
      notesOpenStates[i] = false
    }
  })
  $effect.pre(() => {
    for (
      let i = subRequestOpenStates.length;
      i < subRequestsFromUser.length;
      i++
    ) {
      subRequestOpenStates[i] = false
    }
  })

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        currentUser = user
        classesMissingSubs = await getData(user.object.uid)
      }
    })
  })

  async function getData(userId: string) {
    const {
      userSubRequests,
      classesMissingSubs: missing,
      userSubClasses,
    } = await substituteService.fetchUserSubRequests(userId)

    classesMissingSubs = missing
    classesCheckedOff = new Array(missing.length).fill(null)
    subRequestsFromUser = userSubRequests
    stringSubRequestDates = userSubRequests.map((subRequest) =>
      timestampToDate(subRequest.dateOfClass).toString(),
    )
    originalSubClassNumbers = userSubRequests.map(
      (subRequest) => subRequest.classNumber,
    )
    userSubClassesList = userSubClasses
    return classesMissingSubs
  }

  function sendSubRequest(i: number) {
    if (subRequestsFromUser[i] === null) {
      alert.trigger('error', 'You are not currently editing a sub request.')
      return
    }
    const editingSubRequest = subRequestsFromUser[i]
    editingSubRequest.dateOfClass = new Date(stringSubRequestDates[i])
    substituteService
      .saveSubRequest(editingSubRequest, originalSubClassNumbers[i])
      .then(() => {
        alert.trigger('success', 'Sub request updated!')
        getData(currentUser.object.uid)
      })
      .catch(() => {
        alert.trigger(
          'error',
          'Failed to update sub request, please try again.',
        )
      })
  }

  function deleteSubRequest(subRequestId: string, check: boolean) {
    if (
      check === false ||
      confirm('Are you sure you want to delete this sub request?')
    ) {
      substituteService
        .deleteSubRequest(subRequestId)
        .then(() => {
          alert.trigger(
            'success',
            check ? 'Sub request deleted!' : 'Sub request updated!',
          )
          getData(currentUser.object.uid)
        })
        .catch(() => {
          alert.trigger(
            'error',
            'Failed to delete sub request, please try again.',
          )
        })
    }
  }

  function handleSubmit() {
    const classesToSub = filterCheckedOffSubClasses(classesCheckedOff)
    classesToSub.map((classToSub: Data.SubRequest) => {
      substituteService
        .claimSubstituteSlot(classToSub, currentUser)
        .then(() => {
          classesMissingSubs = classesMissingSubs.filter(
            (classMissingSub) => classMissingSub.id !== classToSub.id,
          )
          userSubClassesList.push(classToSub)
          alert.trigger('success', 'Signup successful!')
          setTimeout(() => {
            window.location.reload()
          }, 1000)
        })
        .catch(() => {
          alert.trigger(
            'error',
            'Error signing up to substitute, please try again.',
          )
        })
    })
  }

  async function sendReminder(subRequest: Data.SubRequest) {
    let { course, subInstructorFirstName, dateOfClass, id } = subRequest
    try {
      const studentList = await classService.fetchStudentListForClass(id)
      sendClassReminder({
        studentList: studentList,
        className: course,
        instructorName: subInstructorFirstName,
        nextMeetingTime: formatDate(timestampToDate(dateOfClass)),
        // Empty, as before: a substitute's reminder speaks only for the one
        // session they are covering, and a sub request doesn't carry the
        // class's instructor list.
        instructorUids: [],
      })
    } catch (err) {
      console.error('Failed to send reminder:', err)
    }
  }

  async function recordClass(subRequest: Data.SubRequest) {
    let { classNumber, dateOfClass, id } = subRequest
    const classId = id.split('---')[0]
    try {
      const classValues = await classService.fetchClassDetails(classId)
      if (!classValues) return
      const confirmHoldClass = confirm(
        `Please confirm you are holding class now. Confirming will redirect you to ${classValues.meetingLink}`,
      )
      if (confirmHoldClass) {
        await substituteService.recordSubstituteClassSession(
          id,
          classId,
          classNumber,
          dateOfClass,
        )
        window.open(classValues.meetingLink)
      }
    } catch (err) {
      console.error('Failed to record class session:', err)
    }
  }
</script>

{#snippet trashIcon()}
  <svg
    width="24px"
    height="24px"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-8"
    ><polyline points="3 6 5 6 21 6"></polyline><path
      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
    ></path><line x1="10" y1="11" x2="10" y2="17"></line><line
      x1="14"
      y1="11"
      x2="14"
      y2="17"
    ></line></svg
  >
{/snippet}

<div>
  {#await classesMissingSubs then classesMissingSubs}
    <Card>
      <h2 class="mt-4 mb-2 text-xl font-bold">Your Classes To Substitute</h2>
      {#if userSubClassesList.length > 0}
        {#each userSubClassesList as classBeingSubbed, i (classBeingSubbed.id)}
          <Dialog bind:open={feedbackOpenStates[i]} size="min" alert>
            {#snippet title()}
              <div class="flex items-center justify-between">
                {classBeingSubbed.course} Substitute Class Feedback Form <Button
                  color="red"
                  class="font-light"
                  onclick={() => (feedbackOpenStates[i] = false)}>Close</Button
                >
              </div>
            {/snippet}
            {#snippet description()}
              <div>
                <InstructorFeedbackForm
                  {classBeingSubbed}
                  sessionNumber={classBeingSubbed.classNumber}
                />
              </div>
            {/snippet}
          </Dialog>
          <Dialog bind:open={notesOpenStates[i]} size="min">
            {#snippet title()}
              <div class="flex items-center justify-between">
                <div>Class Prep Notes</div>
                <Button color="red" onclick={() => (notesOpenStates[i] = false)}
                  >Close</Button
                >
              </div>
            {/snippet}
            {#snippet description()}
              <Card>
                <p>{classBeingSubbed.notes}</p>
                <br />
                <p>
                  Please reach out to the class's usual instructor at {classBeingSubbed.originalInstructorEmail}
                  if you have questions!
                </p>
              </Card>
            {/snippet}
          </Dialog>
          <hr />
          <div
            class={`mt-3 flex items-center justify-between rounded-lg ${classBeingSubbed.subRequestStatus === SubRequestStatus.SubstituteFeedbackNeeded ? 'bg-green-100' : timestampToDate(classBeingSubbed.dateOfClass) < new Date() ? 'bg-red-100' : 'bg-yellow-100'} p-4`}
          >
            <p>
              {classBeingSubbed.course} class #{classBeingSubbed.classNumber} at {formatDate(
                timestampToDate(classBeingSubbed.dateOfClass),
              )}
            </p>
          </div>
          <div class="text-sm italic">
            {classBeingSubbed.subRequestStatus ===
            SubRequestStatus.SubstituteFeedbackNeeded
              ? 'Please remember to fill out the feedback form for this class!'
              : timestampToDate(classBeingSubbed.dateOfClass) > new Date()
                ? 'Please remember to review the notes and prep for the class. Thank you for substituting!'
                : 'Looks like the substitute class was not held! Please reach out to the usual instructor to let them know.'}
          </div>
          <Button
            color="blue"
            class="mt-2 mb-4"
            onclick={() => {
              notesOpenStates[i] = true
            }}>View Prep Notes</Button
          >
          <Button
            color="blue"
            class="mt-2"
            onclick={() =>
              window.open(
                `${curriculums.filter((curriculum) => curriculum.class === classBeingSubbed.course)[0].url}`,
              )}>Curriculum</Button
          >
          <Button
            color="blue"
            class="mt-2"
            onclick={() => recordClass(classBeingSubbed)}>Join</Button
          >
          <Button color="blue" onclick={() => sendReminder(classBeingSubbed)}>
            Send Reminder</Button
          >
          <Button
            color="blue"
            onclick={() => {
              feedbackOpenStates[i] = true
            }}>Submit Feedback</Button
          >
        {/each}
      {:else}
        <p>You are not currently substituting any classes.</p>
      {/if}
    </Card>
    {#if subInstructor !== true}
      <Card class="mt-2 mb-2">
        <h2 class="my-2 text-xl font-bold">Your Sub Requests</h2>
        <div>
          {#if subRequestsFromUser.length > 0}
            {#each subRequestsFromUser as subRequest, i (subRequest.id)}
              <Dialog bind:open={subRequestOpenStates[i]} size="min" alert>
                {#snippet title()}
                  <div class="flex items-center justify-between">
                    {subRequest.course} Substitute Class Feedback Form <Button
                      color="red"
                      class="font-light"
                      onclick={() => (subRequestOpenStates[i] = false)}
                      >Close</Button
                    >
                  </div>
                {/snippet}
                {#snippet description()}
                  <div>
                    <NumberInput
                      class="rounded-sm border p-1"
                      bind:value={subRequestsFromUser[i].classNumber}
                      label="Please confirm the class number ."
                    />
                    <DateTimeInput
                      class="rounded-sm border p-1"
                      bind:value={stringSubRequestDates[i]}
                      label="Please confirm the date and time of the class you would like to request a sub for."
                    />
                    <TextInput
                      class="rounded-sm border p-1"
                      bind:value={subRequestsFromUser[i].notes}
                      label="Please describe what topic/lesson the substitute class will cover, and any helpful notes for the substitute instructor."
                    />
                    <Button
                      color="green"
                      onclick={() => {
                        sendSubRequest(i)
                        subRequestOpenStates[i] = false
                      }}>Save Edits</Button
                    >
                  </div>
                {/snippet}
              </Dialog>
              {#if subRequest.subRequestStatus === SubRequestStatus.SubstituteFound}
                <div
                  class="mt-2 flex items-center justify-between rounded-lg bg-blue-100 p-4"
                >
                  <p>
                    {subRequest.course} class #{subRequest.classNumber} at {formatDate(
                      timestampToDate(subRequest.dateOfClass),
                    )}
                  </p>
                  <p><strong>Status: Substitute Found</strong></p>
                  <Button
                    color="gray"
                    onclick={() => {
                      subRequestOpenStates[i] = true
                    }}>Edit</Button
                  >
                  <Button
                    color="red"
                    onclick={() => deleteSubRequest(subRequest.id, true)}
                    >{@render trashIcon()}</Button
                  >
                </div>
              {:else if subRequest.subRequestStatus === SubRequestStatus.SubstituteNeeded}
                <div
                  class="mt-2 flex items-center justify-between rounded-lg bg-red-100 p-4"
                >
                  <p>
                    {subRequest.course} class #{subRequest.classNumber} at {formatDate(
                      timestampToDate(subRequest.dateOfClass),
                    )}
                  </p>
                  <p><strong>Status: Substitute Needed</strong></p>
                  <Button
                    color="gray"
                    onclick={() => {
                      subRequestOpenStates[i] = true
                    }}>Edit</Button
                  >
                  <Button
                    color="red"
                    onclick={() => deleteSubRequest(subRequest.id, true)}
                    >{@render trashIcon()}</Button
                  >
                </div>
              {:else if subRequest.subRequestStatus === SubRequestStatus.SubstituteFeedbackNeeded}
                <div
                  class="mt-2 flex items-center justify-between rounded-lg bg-yellow-100 p-4"
                >
                  <p>
                    {subRequest.course} class #{subRequest.classNumber} at {formatDate(
                      timestampToDate(subRequest.dateOfClass),
                    )}
                  </p>
                  <p>
                    <strong
                      >Status: Awaiting Substitute Feedback Submission</strong
                    >
                  </p>
                  <Button
                    color="gray"
                    onclick={() => {
                      subRequestOpenStates[i] = true
                    }}>Edit</Button
                  >
                  <Button
                    color="red"
                    onclick={() => deleteSubRequest(subRequest.id, true)}
                    >{@render trashIcon()}</Button
                  >
                </div>
              {:else}
                <div
                  class="mt-2 flex items-center justify-between rounded-lg bg-green-100 p-4"
                >
                  <p>
                    {subRequest.course} class #{subRequest.classNumber} at {formatDate(
                      timestampToDate(subRequest.dateOfClass),
                    )}
                  </p>
                  <p><strong>Status: Substituted Class Complete</strong></p>
                  <Button
                    color="red"
                    onclick={() => deleteSubRequest(subRequest.id, true)}
                    >{@render trashIcon()}</Button
                  >
                </div>
              {/if}
            {/each}
          {:else}
            <p>You have no current sub requests!</p>
          {/if}
        </div>
      </Card>
    {/if}
    <Card>
      <h2 class="mt-2 text-xl font-bold">Substituting Classes</h2>
      <hr class="mt-5 mb-3" />
      <h2 class="mb-2 font-bold">Sign Up To Substitute A Class</h2>
      {#if classesMissingSubs.length > 0}
        <form
          method="POST"
          use:enhance={() => {
            updating = true

            return async ({ update }) => {
              await update()
              updating = false
            }
          }}
        >
          {#each classesMissingSubs as classToSub, i (classToSub.id)}
            <div>
              <label>
                <input
                  type="checkbox"
                  bind:group={classesCheckedOff[i]}
                  disabled={updating}
                  value={classToSub}
                />
                {classToSub.course}, class #{classToSub.classNumber}, at {formatDate(
                  timestampToDate(classToSub.dateOfClass),
                )}
              </label>
            </div>
          {/each}
          <Button color="blue" class="mt-2" onclick={handleSubmit}
            >Submit</Button
          >
        </form>
        {#if updating}
          <span class="saving">saving...</span>
        {/if}
      {:else}
        <p>No current sub requests!</p>
      {/if}
    </Card>
  {/await}
</div>
