<script lang="ts">
  import { db, user } from '$lib/client/firebase'
  import { alert } from '$lib/stores'
  import { updateProfile } from 'firebase/auth'
  import { doc, updateDoc } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'

  const schema = z.object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
  })

  const formResult = superForm(
    defaults({ firstName: '', lastName: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      invalidateAll: false,
      applyAction: false,
      resetForm: false,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          const firstName = formVal.data.firstName.trim()
          const lastName = formVal.data.lastName.trim()
          try {
            await updateDoc(doc(db, 'users', frozenUser.object.uid), {
              firstName,
              lastName,
            })
            await updateProfile(frozenUser.object, {
              displayName: `${firstName} ${lastName}`,
            })
            alert.trigger('success', 'Name successfully updated.')
          } catch (err: any) {
            console.error('Error updating name: ', err)
            alert.trigger('error', 'Failed to update name.')
          }
        }
      },
    },
  )

  const { form, enhance, delayed } = formResult

  onMount(() => {
    return user.subscribe((u) => {
      if (u && u.profile) {
        $form.firstName = u.profile.firstName || ''
        $form.lastName = u.profile.lastName || ''
      }
    })
  })
</script>

<form use:enhance class="w-full">
  <fieldset class="space-y-4" disabled={$delayed}>
    <span class="font-bold">Name</span>
    <div class="grid gap-2 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="firstName"
          label="First name"
          bind:value={$form.firstName}
        />
      </div>
      <div class="flex items-end gap-2">
        <div class="flex w-full flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="lastName"
            label="Last name"
            bind:value={$form.lastName}
          />
        </div>
        <Button
          class="h-12 shrink-0"
          color="blue"
          type="submit"
          disabled={$delayed}
        >
          Update
        </Button>
      </div>
    </div>
  </fieldset>
</form>
