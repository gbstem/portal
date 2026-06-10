<script lang="ts">
  import { alert } from '$lib/stores'
  import { updatePassword } from 'firebase/auth'
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

  const schema = z
    .object({
      newPassword: z
        .string()
        .min(6, 'Password must be at least 6-characters long'),
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    })

  let dialogEl: Dialog
  let passwordToUpdate = ''

  const formResult = superForm(
    defaults(
      { newPassword: '', confirmPassword: '' },
      zod(schema as any) as any,
    ) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        passwordToUpdate = formVal.data.newPassword
        dialogEl.open()
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult

  function handleCancel() {
    reset()
    alert.trigger('info', 'Password change canceled.')
  }

  function handleReauthenticate() {
    if ($user) {
      updatePassword($user.object, passwordToUpdate)
        .then(() => {
          reset()
          dialogEl.close()
          alert.trigger('success', 'Password was successfully changed.')
        })
        .catch((err) => {
          reset()
          dialogEl.close()
          alert.trigger('error', err.code, true)
        })
    }
  }
</script>

<form use:enhance class={cn('w-full', className)}>
  <fieldset class="space-y-4" disabled={$delayed}>
    <span class="font-bold">Change password</span>

    <div class="flex flex-col gap-1.5">
      <FormInput
        form={formResult}
        name="newPassword"
        label="New password"
        type="password"
        bind:value={$form.newPassword}
      />
    </div>

    <div class="flex flex-col gap-1.5 relative">
      <FormInput
        form={formResult}
        name="confirmPassword"
        label="Confirm password"
        type="password"
        bind:value={$form.confirmPassword}
        class="pr-21"
      />
      <div class="absolute right-2 top-6 flex h-12 items-center">
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
