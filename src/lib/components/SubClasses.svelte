<script lang="ts">
  import { onMount } from 'svelte'
  import { db, user } from '$lib/client/firebase'
  import {
    collection,
    doc,
    DocumentReference,
    getDoc,
    getDocs,
    query,
    updateDoc,
    setDoc,
    deleteDoc,
  } from 'firebase/firestore'
  import {
    classesCollection,
    registrationsCollection,
    substituteRequestsCollection,
  } from '$lib/data/collections'
  import { SubRequestStatus } from './helpers/SubRequestStatus'
  import { classTodayHeld, formatDate, timestampToDate } from '$lib/utils'
  import Button from './Button.svelte'
  import { enhance } from '$app/forms'
  import { alert } from '$lib/stores'
  import { ClassStatus } from './helpers/ClassStatus'
  import sendClassReminder from './helpers/sendClassReminder'
  import type Student from './types/Student'
  import Dialog from './Dialog.svelte'
  import InstructorFeedbackForm from './forms/InstructorFeedbackForm.svelte'
  import Card from './Card.svelte'
  import Input from './Input.svelte'
  import { curriculums } from './helpers/curriculum'
  import { Trash2Icon } from 'svelte-feather-icons'

  export let subInstructor: boolean

  let feedbackDialogEl: (Dialog | null)[] = []
  let notesDialogEl: (Dialog | null)[] = []
  let subRequestDialogEl: (Dialog | null)[] = []
  let currentUser: Data.User.Store
  let classesMissingSubs: Data.SubRequest[] = []
  let userSubClassesList: Data.SubRequest[] = []
  let loading = true
  let classesCheckedOff: any[] = []
  let updating = false
  let subRequestsFromUser: Data.SubRequest[] = []
  let stringSubRequestDates: string[] = []
  let originalSubClassNumbers: number[] = []

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        currentUser = user
        loading = false
        classesMissingSubs = await getData(user.object.uid)
      }
    })
  })

  async function getData(userId: string) {
    const q = query(collection(db, substituteRequestsCollection))
    let userSubClasses: Data.SubRequest[] = []
    let userSubRequests: Data.SubRequest[] = []
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((doc) => {
      const classInfo = doc.data() as Data.SubRequest
      if (doc.id.includes(userId)) {
        userSubRequests.push({
          ...classInfo,
          id: doc.id,
        } as Data.SubRequest)
      }
      if (classInfo.subRequestStatus === SubRequestStatus.SubstituteNeeded) {
        classesCheckedOff.push(null)
        classesMissingSubs.push({
          ...classInfo,
          id: doc.id,
        } as Data.SubRequest)
      } else if (
        (classInfo.subRequestStatus === SubRequestStatus.SubstituteFound ||
          classInfo.subRequestStatus ===
            SubRequestStatus.SubstituteFeedbackNeeded) &&
        classInfo.subInstructorId === userId
      ) {
        userSubClasses.push({
          ...classInfo,
          id: doc.id,
        } as Data.SubRequest)
        feedbackDialogEl.push(null)
        notesDialogEl.push(null)
      }
    })
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
    setDoc(
      doc(
        db,
        'subRequests',
        currentUser.object.uid + '---' + editingSubRequest.classNumber,
      ),
      editingSubRequest,
    )
      .then((res) => {
        alert.trigger('success', 'Sub request updated!')
        if (editingSubRequest.classNumber !== originalSubClassNumbers[i]) {
          deleteSubRequest(originalSubClassNumbers[i], false)
        }
        getData(currentUser.object.uid)
      })
      .catch((err) => {
        alert.trigger(
          'error',
          'Failed to update sub request, please try again.',
        )
      })
  }

  function deleteSubRequest(classNumber: number, check: boolean) {
    if (
      check === false ||
      confirm('Are you sure you want to delete this sub request?')
    ) {
      deleteDoc(
        doc(
          db,
          substituteRequestsCollection,
          currentUser.object.uid + '---' + classNumber,
        ),
      )
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
    const classesToSub = classesCheckedOff
      .filter((classCheckedOff: any) => classCheckedOff !== null)
      .map((classCheckedOff: any) => classCheckedOff[0])
    classesToSub.map((classToSub: Data.SubRequest) => {
      const classToSubDoc = doc(db, substituteRequestsCollection, classToSub.id)
      updateDoc(classToSubDoc, {
        subRequestStatus: SubRequestStatus.SubstituteFound,
        subInstructorId: currentUser.object.uid,
        subInstructorFirstName: currentUser.profile.firstName,
        subInstructorEmail: currentUser.object.email,
      }).then(() => {
        classesMissingSubs = classesMissingSubs.filter(
          (classMissingSub) => classMissingSub.id !== classToSub.id,
        )
        userSubClassesList.push(classToSub)
        fetch('api/substitute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: currentUser.profile.firstName,
            subInstructorEmail: currentUser.object.email,
            course: classToSub.course,
            classNumber: classToSub.classNumber,
            date: formatDate(timestampToDate(classToSub.dateOfClass)),
            originalInstructorEmail: classToSub.originalInstructorEmail,
          }),
        }).then((response) => {
          if (response.ok) {
            alert.trigger('success', 'Signup successful!')
            setTimeout(() => {
              window.location.reload()
            }, 1000)
          } else {
            alert.trigger(
              'error',
              'Error signing up to substitute, please try again.',
            )
          }
        })
      })
    })
  }

  function getStudentList(studentUids: string[]): Promise<Student[]> {
    let studentList: Student[] = []

    const studentPromises = studentUids.map(async (studentUid) => {
      const studentDocRef: DocumentReference = doc(
        db,
        registrationsCollection,
        studentUid,
      )
      const studentDoc = await getDoc(studentDocRef)
      if (studentDoc.exists()) {
        const data = studentDoc.data()
        if (data) {
          const student: Student = {
            name: `${data.personal.studentFirstName} ${data.personal.studentLastName}`,
            email: data.personal.email,
            secondaryEmail: data.personal.secondaryEmail,
            phone: data.personal.phoneNumber,
            grade: data.academic.grade,
            school: data.academic.school,
          }
          studentList.push(student)
        }
      }
    })

    return Promise.all(studentPromises).then(() => studentList)
  }

  function sendReminder(subRequest: Data.SubRequest) {
    let {
      course,
      subInstructorEmail,
      subInstructorFirstName,
      dateOfClass,
      id,
    } = subRequest
    getDoc(doc(db, classesCollection, id)).then(async (document) => {
      const values = (await document.data()) as Data.Class
      let { students } = values
      const studentList = await getStudentList(students)
      sendClassReminder({
        studentList: studentList,
        className: course,
        instructorName: subInstructorFirstName,
        instructorEmail: subInstructorEmail,
        nextMeetingTime: formatDate(timestampToDate(dateOfClass)),
        otherInstructorEmails: '',
      })
    })
  }

  function recordClass(subRequest: Data.SubRequest) {
    let { classNumber, dateOfClass, id } = subRequest
    getDoc(doc(db, classesCollection, id.split('---')[0])).then((document) => {
      const values = document.data() as Data.Class
      let {
        meetingLink,
        classStatuses,
        completedClassDates,
        feedbackCompleted,
      } = values
      const confirmHoldClass = confirm(
        `Please confirm you are holding class now. Confirming will redirect you to ${meetingLink}`,
      )
      if (confirmHoldClass) {
        classStatuses[classNumber - 1] = ClassStatus.FeedbackIncomplete
        completedClassDates.push(dateOfClass)
        const classDoc = doc(db, classesCollection, id.split('---')[0])
        updateDoc(classDoc, {
          completedClassDates: completedClassDates,
          classStatuses: classStatuses,
        }).then(() => {
          updateDoc(doc(db, substituteRequestsCollection, id), {
            subRequestStatus: SubRequestStatus.SubstituteFeedbackNeeded,
          })
        })
        window.open(meetingLink)
      }
    })
  }
</script>

<div>
  {#await classesMissingSubs then classesMissingSubs}
    <Card>
      <h2 class="mt-4 mb-2 text-xl font-bold">Your Classes To Substitute</h2>
      {#if userSubClassesList.length > 0}
        {#each userSubClassesList as classBeingSubbed, i}
          <Dialog bind:this={feedbackDialogEl[i]} size="min" alert>
            <svelte:fragment slot="title"
              ><div class="flex items-center justify-between">
                {classBeingSubbed.course} Substitute Class Feedback Form <Button
                  color="red"
                  class="font-light"
                  on:click={feedbackDialogEl[i].cancel}>Close</Button
                >
              </div>
            </svelte:fragment>
            <div slot="description">
              <InstructorFeedbackForm
                {classBeingSubbed}
                sessionNumber={classBeingSubbed.classNumber}
              />
            </div>
          </Dialog>
          <Dialog bind:this={notesDialogEl[i]} size="min">
            <svelte:fragment slot="title"
              ><div class="flex items-center justify-between">
                <div>Class Prep Notes</div>
                <Button color="red" on:click={notesDialogEl[i].cancel}
                  >Close</Button
                >
              </div></svelte:fragment
            >
            <Card slot="description">
              <p>{classBeingSubbed.notes}</p>
              <br />
              <p>
                Please reach out to the class's usual instructor at {classBeingSubbed.originalInstructorEmail}
                if you have questions!
              </p>
            </Card>
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
            on:click={() => {
              notesDialogEl[i]?.open()
            }}>View Prep Notes</Button
          >
          <Button
            color="blue"
            class="mt-2"
            on:click={() =>
              window.open(
                `${curriculums.filter((curriculum) => curriculum.class === classBeingSubbed.course)[0].url}`,
              )}>Curriculum</Button
          >
          <Button
            color="blue"
            class="mt-2"
            on:click={() => recordClass(classBeingSubbed)}>Join</Button
          >
          <Button color="blue" on:click={() => sendReminder(classBeingSubbed)}>
            Send Reminder</Button
          >
          <Button
            color="blue"
            on:click={() => {
              feedbackDialogEl[i]?.open()
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
            {#each subRequestsFromUser as subRequest, i}
              <Dialog bind:this={subRequestDialogEl[i]} size="min" alert>
                <svelte:fragment slot="title"
                  ><div class="flex items-center justify-between">
                    {subRequest.course} Substitute Class Feedback Form <Button
                      color="red"
                      class="font-light"
                      on:click={subRequestDialogEl[i].cancel}>Close</Button
                    >
                  </div>
                </svelte:fragment>
                <div slot="description">
                  <Input
                    type="number"
                    class="rounded-sm border p-1"
                    bind:value={subRequestsFromUser[i].classNumber}
                    label="Please confirm the class number ."
                  />
                  <Input
                    type="datetime-local"
                    class="rounded-sm border p-1"
                    bind:value={stringSubRequestDates[i]}
                    label="Please confirm the date and time of the class you would like to request a sub for."
                  />
                  <Input
                    type="text"
                    class="rounded-sm border p-1"
                    bind:value={subRequestsFromUser[i].notes}
                    label="Please describe what topic/lesson the substitute class will cover, and any helpful notes for the substitute instructor."
                  />
                  <Button
                    color="green"
                    on:click={() => {
                      sendSubRequest(i)
                      subRequestDialogEl[i]?.close()
                    }}>Save Edits</Button
                  >
                </div>
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
                    on:click={() => {
                      subRequestDialogEl[i]?.open()
                    }}>Edit</Button
                  >
                  <Button
                    color="red"
                    on:click={() =>
                      deleteSubRequest(originalSubClassNumbers[i], true)}
                    ><Trash2Icon class="h-8" /></Button
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
                    on:click={() => {
                      subRequestDialogEl[i]?.open()
                    }}>Edit</Button
                  >
                  <Button
                    color="red"
                    on:click={() =>
                      deleteSubRequest(originalSubClassNumbers[i], true)}
                    ><Trash2Icon class="h-8" /></Button
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
                    on:click={() => {
                      subRequestDialogEl[i]?.open()
                    }}>Edit</Button
                  >
                  <Button
                    color="red"
                    on:click={() =>
                      deleteSubRequest(originalSubClassNumbers[i], true)}
                    ><Trash2Icon class="h-8" /></Button
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
                    on:click={() =>
                      deleteSubRequest(originalSubClassNumbers[i], true)}
                    ><Trash2Icon class="h-8" /></Button
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
      <h2 class="mt-2 ml-2 text-xl font-bold">Substituting Classes</h2>
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
          {#each classesMissingSubs as classToSub, i}
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
          <Button color="blue" class="mt-2" on:click={handleSubmit}
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
