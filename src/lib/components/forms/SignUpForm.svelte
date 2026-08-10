<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import { goto } from '$app/navigation'
  import Brand from '$lib/components/Brand.svelte'
  import { userService } from '$lib/services/userService'
  import { alert } from '$lib/stores'
  import type { User } from 'firebase/auth'
  import Link from '../Link.svelte'
  import Button from '../Button.svelte'
  import Loading from '../Loading.svelte'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import { passwordSchema } from './schemas'

  const schema = z
    .object({
      role: z.string().min(1, 'Role is required'),
      firstName: z.string().trim().min(1, 'First name is required'),
      lastName: z.string().trim().min(1, 'Last name is required'),
      email: z.string().email('Invalid email address'),
      password: passwordSchema,
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    })

  /**
   * Exchanges the new account's ID token for a session cookie. Throws if the
   * exchange fails, so the caller's rollback tears the account back down.
   */
  async function syncSession(createdUser: User): Promise<void> {
    const idToken = await createdUser.getIdToken()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || 'Session synchronization failed')
    }
  }

  /**
   * Sends the verification email. Deliberately non-fatal — a mail hiccup must
   * not roll back an otherwise good account; the user can resend from
   * `/profile`. Returns whether the send succeeded so the caller can tell the
   * user, since a silent failure leaves them trusting an email that was never
   * sent.
   */
  async function sendVerificationEmail(email: string): Promise<boolean> {
    const payload: ActionRequestBody = { type: 'verifyEmail', email }
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error(
        '[SignUpForm] Email verification send error:',
        data.message || 'Unknown error',
      )
      return false
    }
    return true
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
        const role: 'instructor' | 'student' =
          formVal.data.role ===
          'High school/college student applying to be an instructor'
            ? 'instructor'
            : 'student'

        let createdUser: User | null = null
        try {
          createdUser = await userService.createUser({
            email: formVal.data.email,
            password: formVal.data.password,
            firstName,
            lastName,
            role,
          })
          await syncSession(createdUser)
          const emailSent = await sendVerificationEmail(formVal.data.email)
          if (!emailSent) {
            alert.trigger(
              'error',
              'Account created, but the verification email failed to send. You can request another from your profile page.',
            )
          }
          await goto('/profile')
        } catch (err: any) {
          if (createdUser) {
            await userService.rollbackNewUser(createdUser)
          }
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

  const { form, enhance, submitting } = formResult
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
