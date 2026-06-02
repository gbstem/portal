<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import Input from '$lib/components/Input.svelte'
  import { alert } from '$lib/stores'
  import Brand from '$lib/components/Brand.svelte'
  import Form from '$lib/components/Form.svelte'
  import Link from '$lib/components/Link.svelte'
  import Button from '../Button.svelte'
  import { cn } from '$lib/utils'
  import { user } from '$lib/client/firebase'

  let disabled = false
  let showValidation = false
  let values = {
    email: '',
  }
  function handleSubmit(e: CustomEvent<SubmitData>) {
    if (e.detail.error === null) {
      showValidation = false
      disabled = true
      const payload: ActionRequestBody = {
        type: 'resetPassword',
        email: values.email,
      }
      fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger(
            'info',
            'Password reset email was sent. Please check your inbox.',
          )
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
        values = {
          email: '',
        }
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
    <h1 class="text-2xl font-bold">Reset password</h1>
    <Input
      type="email"
      bind:value={values.email}
      label="Email"
      floating
      required
    />
    <div class="flex items-center justify-between">
      <span>
        <Link href="/signup">Sign up</Link> or
        <Link href="/signin">sign in</Link>.
      </span>
      <Button color="blue" type="submit">Send email</Button>
    </div>
  </fieldset>
</Form>
