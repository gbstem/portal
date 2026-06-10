<script lang="ts">
  import { doc, updateDoc } from 'firebase/firestore'
  import { updateProfile } from 'firebase/auth'
  import { db, user } from '$lib/client/firebase'
  import { alert } from '$lib/stores'
  import { onMount } from 'svelte'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }

  const schema = z.object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
  })

  let disabled = true

  const formResult = superForm(
    defaults({ firstName: '', lastName: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          disabled = true
          const firstName = formVal.data.firstName.trim()
          const lastName = formVal.data.lastName.trim()
          updateDoc(doc(db, 'users', frozenUser.object.uid), {
            firstName,
            lastName,
          })
            .then(() =>
              updateProfile(frozenUser.object, {
                displayName: `${firstName} ${lastName}`,
              }).then(() => {
                disabled = false
                alert.trigger('success', 'Name successfully updated.')
              }),
            )
            .catch((err) => {
              disabled = false
              alert.trigger('error', err.code, true)
            })
        }
      },
    },
  )

  const { form, enhance, delayed } = formResult

  onMount(() => {
    return user.subscribe((u) => {
      if (u) {
        $form.firstName = u.profile.firstName || ''
        $form.lastName = u.profile.lastName || ''
        disabled = false
      }
    })
  })
</script>

<form use:enhance class={cn('w-full', className)}>
  <fieldset class="space-y-4" {disabled}>
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
          class="mb-0.5 flex h-12 w-12 shrink-0 items-center justify-center p-0"
          color="blue"
          type="submit"
          disabled={$delayed}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-6 w-6"
          >
            <path
              d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
            /><polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </Button>
      </div>
    </div>
  </fieldset>
</form>
