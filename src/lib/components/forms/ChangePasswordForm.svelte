<script lang="ts">
  import { user } from '$lib/client/firebase'
  import Dialog from '$lib/components/Dialog.svelte'
  import ReauthenticateForm from '$lib/components/forms/ReauthenticateForm.svelte'
  import { alert } from '$lib/stores'
  import { updatePassword } from 'firebase/auth'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import DialogActions from '../DialogActions.svelte'
  import FormInput from '../FormInput.svelte'

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
      invalidateAll: false,
      applyAction: false,
      onUpdate({ form: formVal }) {
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

  async function handleReauthenticate() {
    if ($user) {
      try {
        await updatePassword($user.object, passwordToUpdate)
        alert.trigger('success', 'Password was successfully changed.')
      } catch (err: any) {
        alert.trigger('error', err.code, true)
      } finally {
        reset()
        dialogEl.close()
      }
    }
  }
</script>

<form use:enhance class="w-full">
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

    <div class="relative flex flex-col gap-1.5">
      <FormInput
        form={formResult}
        name="confirmPassword"
        label="Confirm password"
        type="password"
        bind:value={$form.confirmPassword}
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
