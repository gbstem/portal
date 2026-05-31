<script lang="ts">
  import Input from '$lib/components/Input.svelte'
  import { alert } from '$lib/stores'
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
    newEmail: '',
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
      newEmail: '',
    }
    alert.trigger('info', 'Email change canceled.')
  }
  function handleReauthenticate() {
    if ($user) {
      dialogEl.close()
      fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'changeEmail',
          newEmail: values.newEmail,
          firstName: $user.profile.firstName,
        }),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger('info', 'A verification email was sent.')
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
        values = {
          newEmail: '',
        }
        disabled = false
      })
    }
  }
</script>

<Form
  class={cn(showValidation && 'show-validation', className)}
  on:submit={handleSubmit}
>
  <fieldset {disabled}>
    <span class="font-bold">Change email</span>
    <Input
      type="email"
      value={$user && $user.object.email ? $user.object.email : ''}
      label="Current email"
      floating
      readonly
    />
    <div class="relative">
      <Input
        class="pr-21"
        type="email"
        bind:value={values.newEmail}
        label="New email"
        floating
        required
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
