<script lang="ts">
  import Input from '$lib/components/Input.svelte'
  import { alert } from '$lib/stores'
  import { updatePassword } from 'firebase/auth'
  import Dialog from '$lib/components/Dialog.svelte'
  import ReauthenticateForm from '$lib/components/forms/ReauthenticateForm.svelte'
  import Form from '$lib/components/Form.svelte'
  import { user } from '$lib/client/firebase'
  import DialogActions from '../DialogActions.svelte'
  import Button from '../Button.svelte'
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }

  let dialogEl: Dialog
  let disabled = false
  let showValidation = false
  let values = {
    newPassword: '',
    confirmPassword: '',
  }
  function handleSubmit(e: CustomEvent<SubmitData>) {
    if (e.detail.error === null) {
      showValidation = false
      disabled = true
      dialogEl.open()
    } else {
      showValidation = true
      alert.trigger('error', e.detail.error)
    }
  }
  function handleCancel() {
    disabled = false
    values = {
      newPassword: '',
      confirmPassword: '',
    }
    alert.trigger('info', 'Password change canceled.')
  }
  function handleReauthenticate() {
    if ($user) {
      updatePassword($user.object, values.newPassword)
        .then(() => {
          disabled = false
          values = {
            newPassword: '',
            confirmPassword: '',
          }
          dialogEl.close()
          alert.trigger('success', 'Password was successfully changed.')
        })
        .catch((err) => {
          disabled = false
          values = {
            newPassword: '',
            confirmPassword: '',
          }
          dialogEl.close()
          alert.trigger('error', err.code, true)
        })
    }
  }
</script>

<Form
  class={cn(showValidation && 'show-validation', className)}
  on:submit={handleSubmit}
>
  <fieldset {disabled}>
    <span class="font-bold">Change password</span>
    <Input
      type="password"
      bind:value={values.newPassword}
      label="New password"
      floating
      required
    />
    <div class="relative">
      <Input
        class="pr-21"
        type="password"
        bind:value={values.confirmPassword}
        label="Confirm password"
        floating
        required
        validations={[
          [
            values.newPassword !== values.confirmPassword,
            'Passwords do not match.',
          ],
        ]}
      />
      <div class="absolute right-2 top-0 flex h-12 items-center">
        <Button color="blue" class="px-2 py-1" type="submit">Update</Button>
      </div>
    </div>
  </fieldset>
</Form>

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
