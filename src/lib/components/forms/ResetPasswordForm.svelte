<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import { alert } from '$lib/stores'
  import Brand from '$lib/components/Brand.svelte'
  import Link from '$lib/components/Link.svelte'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import { cn } from '$lib/utils'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  const schema = z.object({
    email: z.string().email('Invalid email address'),
  })

  const formResult = superForm(
    defaults({ email: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        const payload: ActionRequestBody = {
          type: 'resetPassword',
          email: formVal.data.email,
        }
        try {
          const res = await fetch('/api/action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })
          if (res.ok) {
            alert.trigger(
              'info',
              'Password reset email was sent. Please check your inbox.',
            )
          } else {
            const { message } = await res.json()
            alert.trigger('error', message)
          }
          reset()
        } catch (err: any) {
          alert.trigger('error', err.message || 'Something went wrong')
        }
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult
</script>

<form use:enhance class="max-w-lg w-full">
  <fieldset class="space-y-4" disabled={$delayed}>
    <Brand />
    <h1 class="text-2xl font-bold">Reset password</h1>
    <FormInput
      form={formResult}
      name="email"
      label="Email"
      type="email"
      bind:value={$form.email}
    />
    <div class="flex items-center justify-between">
      <span>
        <Link href="/signup">Sign up</Link> or
        <Link href="/signin">sign in</Link>.
      </span>
      <Button color="blue" type="submit" disabled={$delayed}>Send email</Button>
    </div>
  </fieldset>
</form>
