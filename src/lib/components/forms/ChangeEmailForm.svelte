<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import { alert } from '$lib/stores'
  import Dialog from '$lib/components/Dialog.svelte'
  import ReauthenticateForm from '$lib/components/forms/ReauthenticateForm.svelte'
  import { user } from '$lib/client/firebase'
  import DialogActions from '../DialogActions.svelte'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import { cn } from '$lib/utils'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'

  let className = ''
  export { className as class }

  const schema = z.object({
    newEmail: z.string().email('Invalid email address'),
  })

  let dialogEl: Dialog
  let emailToUpdate = ''

  const formResult = superForm(
    defaults({ newEmail: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        emailToUpdate = formVal.data.newEmail
        dialogEl.open()
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult

  function handleCancel() {
    reset()
    alert.trigger('info', 'Email change canceled.')
  }

  function handleReauthenticate() {
    if ($user) {
      dialogEl.close()
      const payload: ActionRequestBody = {
        type: 'changeEmail',
        newEmail: emailToUpdate,
        firstName: $user.profile.firstName,
      }
      fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger('info', 'A verification email was sent.')
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
        reset()
      })
    }
  }
</script>

<form use:enhance class={cn('w-full', className)}>
  <fieldset class="space-y-4" disabled={$delayed}>
    <span class="font-bold">Change email</span>

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-bold" for="current-email">Current email</label>
      <input
        id="current-email"
        type="email"
        value={$user && $user.object.email ? $user.object.email : ''}
        readonly
        disabled
        class="block h-12 w-full appearance-none rounded-md border border-gray-300 bg-gray-50 px-3 text-gray-500 outline-hidden"
      />
    </div>

    <div class="relative flex flex-col gap-1.5">
      <FormInput
        form={formResult}
        name="newEmail"
        label="New email"
        type="email"
        bind:value={$form.newEmail}
        class="pr-21"
      />
      <div class="absolute top-6 right-2 flex h-12 items-center">
        <Button color="blue" class="px-2 py-1" type="submit" disabled={$delayed}
          >Update</Button
        >
      </div>
    </div>
  </fieldset>
</form>

<Dialog bind:this={dialogEl} on:cancel={handleCancel}>
  <svelte:fragment slot="title">Reauthenticate</svelte:fragment>
  <svelte:fragment slot="description">
    <ReauthenticateForm on:reauthenticate={handleReauthenticate}>
      <DialogActions>
        <Button on:click={dialogEl.cancel}>Cancel</Button>
        <Button type="submit" color="blue">Reauthenticate</Button>
      </DialogActions>
    </ReauthenticateForm>
  </svelte:fragment>
</Dialog>
