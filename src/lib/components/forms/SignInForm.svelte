<script lang="ts">
  import { goto } from '$app/navigation'
  import { auth } from '$lib/client/firebase'
  import Brand from '$lib/components/Brand.svelte'
  import { alert } from '$lib/stores'
  import { signInWithEmailAndPassword } from 'firebase/auth'
  import Button from '../Button.svelte'
  import Link from '../Link.svelte'
  import FormInput from '../FormInput.svelte'
  import { cn } from '$lib/utils'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  const schema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  })

  let disabled = false

  const formResult = superForm(
    defaults({ email: '', password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        disabled = true
        signInWithEmailAndPassword(
          auth,
          formVal.data.email,
          formVal.data.password,
        )
          .then((credential) => {
            return credential.user.getIdToken().then((idToken) => {
              return fetch('/api/auth', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ idToken }),
              })
            })
          })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              throw new Error(data.message || 'Unauthorized')
            }
            await goto('/dashboard')
          })
          .catch((err) => {
            disabled = false
            console.error('Sign in error:', err)
            const isFirebaseError =
              err.code && typeof err.code === 'string' && err.code.includes('/')
            if (isFirebaseError) {
              alert.trigger('error', err.code, true)
            } else {
              alert.trigger('error', err.message || 'Unauthorized')
            }
          })
      },
    },
  )

  const { form, enhance, delayed } = formResult
</script>

<form use:enhance class="max-w-lg w-full">
  <fieldset class="space-y-4" disabled={disabled || $delayed}>
    <Brand />
    <h1 class="text-2xl font-bold">Sign in</h1>
    <FormInput
      form={formResult}
      name="email"
      label="Email"
      type="email"
      bind:value={$form.email}
    />
    <FormInput
      form={formResult}
      name="password"
      label="Password"
      type="password"
      bind:value={$form.password}
      autocomplete="current-password"
    />
    <div class="flex items-center justify-between">
      <div class="flex flex-col gap-1">
        <Link href="/reset-password">Forgot password?</Link>
        <Link href="/signup">Need to sign up?</Link>
      </div>
      <Button color="blue" type="submit" disabled={disabled || $delayed}
        >Sign in</Button
      >
    </div>
  </fieldset>
</form>
