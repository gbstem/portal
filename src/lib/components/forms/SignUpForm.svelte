<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import { goto } from '$app/navigation'
  import Brand from '$lib/components/Brand.svelte'
  import { alert } from '$lib/stores'
  import { doc, getDoc, setDoc } from 'firebase/firestore'
  import { customAlphabet } from 'nanoid'
  import {
    createUserWithEmailAndPassword,
    deleteUser,
    updateProfile,
  } from 'firebase/auth'
  import { auth, db } from '$lib/client/firebase'
  import Link from '../Link.svelte'
  import Button from '../Button.svelte'
  import Loading from '../Loading.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import { cn } from '$lib/utils'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  const schema = z
    .object({
      role: z.string().min(1, 'Role is required'),
      firstName: z.string().trim().min(1, 'First name is required'),
      lastName: z.string().trim().min(1, 'Last name is required'),
      email: z.string().email('Invalid email address'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    })

  function generateId() {
    const alphabet = '0123456789'
    const nanoid = customAlphabet(alphabet, 7)
    return nanoid()
  }

  const formResult = superForm(
    defaults(
      {
        role: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
      },
      zod(schema as any) as any,
    ) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        const firstName = formVal.data.firstName.trim()
        const lastName = formVal.data.lastName.trim()

        let createdUser: any = null
        try {
          const credential = await createUserWithEmailAndPassword(
            auth,
            formVal.data.email,
            formVal.data.password,
          )
          createdUser = credential.user

          await updateProfile(createdUser, {
            displayName: `${firstName} ${lastName}`,
          })

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
              console.error('[SignUpForm] Error checking ID uniqueness:', err)
              id = ''
            }
          }

          if (id === '') {
            alert.trigger(
              'error',
              'ID could not be generated. Please contact support.',
            )
            try {
              await deleteUser(createdUser)
            } catch (delErr) {
              console.error(
                '[SignUpForm] Error deleting rollbacked user:',
                delErr,
              )
            }
            return
          }

          await setDoc(doc(db, 'ids', id), {})
          await setDoc(doc(db, 'users', createdUser.uid), {
            id,
            role:
              formVal.data.role ===
              'High school/college student applying to be an instructor'
                ? 'instructor'
                : 'student',
            firstName,
            lastName,
          })

          const idToken = await createdUser.getIdToken()
          const authRes = await fetch('/api/auth', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ idToken }),
          })

          if (!authRes.ok) {
            const authData = await authRes.json().catch(() => ({}))
            throw new Error(
              authData.message || 'Session synchronization failed',
            )
          }

          const payload: ActionRequestBody = {
            type: 'verifyEmail',
            email: formVal.data.email,
          }
          const actionRes = await fetch('/api/action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (!actionRes.ok) {
            const actionData = await actionRes.json().catch(() => ({}))
            console.error(
              '[SignUpForm] Email verification send error:',
              actionData.message || 'Unknown error',
            )
          }

          await goto('/profile')
        } catch (err: any) {
          console.error('[SignUpForm] Registration error:', err)
          const isFirebaseError =
            err.code && typeof err.code === 'string' && err.code.includes('/')
          alert.trigger(
            'error',
            isFirebaseError
              ? err.code
              : err.message || 'Failed to complete registration.',
            isFirebaseError,
          )
        }
      },
    },
  )

  const { form, enhance, delayed, submitting } = formResult
</script>

<form use:enhance class="w-full max-w-lg">
  <fieldset class="space-y-4" disabled={$submitting}>
    <Brand />
    <h1 class="text-2xl font-bold">Sign up</h1>
    <div class="relative space-y-4">
      <div class="flex flex-col gap-1.5">
        <FormSelect
          form={formResult}
          name="role"
          label="I am a..."
          options={[
            {
              name: 'High school/college student applying to be an instructor',
            },
            { name: 'Parent registering my child for classes' },
          ]}
          bind:value={$form.role}
        />
      </div>

      {#if $form.role === 'Parent registering my child for classes'}
        <div
          class="relative mb-4 rounded-sm border border-green-400 bg-green-100 px-4 py-3 text-sm text-green-700"
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
        <div class="flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="firstName"
            label="First name"
            bind:value={$form.firstName}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="lastName"
            label="Last name"
            bind:value={$form.lastName}
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="email"
          label="Email"
          type="email"
          bind:value={$form.email}
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="password"
          label="Password"
          type="password"
          bind:value={$form.password}
          autocomplete="new-password"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="confirmPassword"
          label="Confirm password"
          type="password"
          bind:value={$form.confirmPassword}
          autocomplete="new-password"
        />
      </div>

      {#if $submitting}
        <Loading class="absolute -inset-2 -top-4 z-50" />
      {/if}
    </div>
    <div class="mt-2 flex items-center justify-between">
      <div>
        <Link href="/signin">Need to sign in?</Link>
      </div>
      <Button color="blue" type="submit" disabled={$submitting}>Sign up</Button>
    </div>
  </fieldset>
</form>
