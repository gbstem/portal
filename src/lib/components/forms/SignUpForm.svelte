<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import Input from '$lib/components/Input.svelte'
  import { goto } from '$app/navigation'
  import Brand from '$lib/components/Brand.svelte'
  import { alert } from '$lib/stores'
  import { doc, getDoc, setDoc } from 'firebase/firestore'
  import { customAlphabet } from 'nanoid'
  import Form from '$lib/components/Form.svelte'
  import {
    createUserWithEmailAndPassword,
    deleteUser,
    updateProfile,
  } from 'firebase/auth'
  import { auth, db } from '$lib/client/firebase'
  import Link from '../Link.svelte'
  import Button from '../Button.svelte'
  import Loading from '../Loading.svelte'
  import { cn } from '$lib/utils'
  import Select from '../Select.svelte'

  let disabled = false
  let showValidation = false
  let values = {
    role: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  }
  function generateId() {
    const alphabet = '0123456789'
    const nanoid = customAlphabet(alphabet, 7)
    return nanoid()
  }
  function handleSubmit(e: CustomEvent<SubmitData>) {
    if (e.detail.error === null) {
      showValidation = false
      disabled = true
      const firstName = values.firstName.trim()
      const lastName = values.lastName.trim()

      createUserWithEmailAndPassword(auth, values.email, values.password)
        .then(({ user }) => {
          updateProfile(user, {
            displayName: `${firstName} ${lastName}`,
          })
            .then(async () => {
              // attempt to generate id
              let id = generateId()
              for (let i = 0; i < 5; ++i) {
                try {
                  const res = await getDoc(doc(db, 'ids', id))
                  if (res.exists()) {
                    id = generateId()
                    if (i == 4) {
                      id = ''
                    }
                  } else {
                    break
                  }
                } catch (err) {
                  id = ''
                }
              }
              if (id === '') {
                alert.trigger(
                  'error',
                  'id could not be generated. Contact admin and create a new account.',
                )
                deleteUser(user)
              } else {
                setDoc(doc(db, 'ids', id), {})
                  .then(() => {
                    setDoc(doc(db, 'users', user.uid), {
                      id,
                      role:
                        values.role ===
                        'High school/college student applying to be an instructor'
                          ? 'instructor'
                          : 'student',
                      firstName,
                      lastName,
                    }).then(() => {
                      user.getIdToken().then((idToken) => {
                        fetch('/api/auth', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ idToken }),
                        })
                          .then(() => {
                            const payload: ActionRequestBody = {
                              type: 'verifyEmail',
                              email: values.email,
                            }
                            fetch('/api/action', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify(payload),
                            }).then(async (res) => {
                              if (!res.ok) {
                                const { message } = await res.json()
                                console.error(
                                  'Email verification send error:',
                                  message,
                                )
                              }
                              disabled = false
                              goto('/profile')
                            })
                          })
                          .catch((err) => {
                            console.error('Sign in error:', err)
                            disabled = false
                          })
                      })
                    })
                  })
                  .catch((err) => {
                    console.error('ID collection write error:', err)
                    disabled = false
                  })
              }
            })
            .catch((err) => {
              console.error('User profile update error:', err)
              disabled = false
            })
        })
        .catch((err) => {
          alert.trigger('error', err.code, true)
          disabled = false
        })
    } else {
      showValidation = true
      alert.trigger('error', e.detail.error)
    }
  }
</script>

<Form
  class={cn('max-w-lg', showValidation && 'show-validation')}
  on:submit={handleSubmit}
>
  <fieldset class="space-y-4" {disabled}>
    <Brand />
    <h1 class="text-2xl font-bold">Sign up</h1>
    <div class="relative space-y-4">
      <Select
        bind:value={values.role}
        label="I am a..."
        required
        floating
        options={[
          { name: 'High school/college student applying to be an instructor' },
          { name: 'Parent registering my child for classes' },
        ]}
      />

      {#if values.role === 'Parent registering my child for classes'}
        <!-- <div
          class="relative mb-4 rounded-sm border border-red-400 bg-red-100 px-4 py-3 text-red-700"
          role="alert"
        >
          <strong class="font-bold"
            >STOP: STUDENT REGISTRATIONS ARE NOT OPEN YET. IF YOU CREATE AN
            ACCOUNT NOW, YOUR ACCOUNT WILL BE DELETED AND ALL ACCOUNT INFO WILL
            BE LOST.
          </strong>
        </div> -->

        <div
          class="relative mb-4 rounded-sm border border-green-400 bg-green-100 px-4 py-3 text-green-700"
          role="alert"
        >
          <strong class="font-bold"
            >Note: These fields are asking for the name and email of the PARENT,
            not the student. If you have more than one child, you do NOT need to
            create a separate account for each child.
          </strong>
        </div>
      {/if}

      <div class="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <Input
          type="text"
          bind:value={values.firstName}
          label="First name"
          floating
          required
        />
        <Input
          type="text"
          bind:value={values.lastName}
          label="Last name"
          floating
          required
        />
      </div>
      <Input
        type="email"
        bind:value={values.email}
        label="Email"
        floating
        required
      />
      <Input
        type="password"
        bind:value={values.password}
        label="Password"
        floating
        required
        autocomplete="new-password"
      />
      <Input
        type="password"
        bind:value={values.confirmPassword}
        label="Confirm password"
        floating
        required
        autocomplete="new-password"
        validations={[
          [
            values.password !== values.confirmPassword,
            'Passwords do not match.',
          ],
        ]}
      />
      {#if disabled}
        <Loading class="absolute -inset-2 -top-4 z-50" />
      {/if}
    </div>
    <div class="mt-2 flex items-center justify-between">
      <div>
        <Link href="/signin">Need to sign in?</Link>
      </div>
      <Button color="blue" type="submit">Sign up</Button>
    </div>
  </fieldset>
</Form>
