<script lang="ts">
  import { user } from '$lib/client/firebase'
  import { alert } from '$lib/stores'
  import {
    EmailAuthProvider,
    reauthenticateWithCredential,
  } from 'firebase/auth'
  import { createEventDispatcher } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import FormInput from '../FormInput.svelte'

  const dispatch = createEventDispatcher<{
    reauthenticate: boolean
  }>()

  const schema = z.object({
    password: z.string().min(1, 'Password is required'),
  })

  const formResult = superForm(
    defaults({ password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          try {
            await reauthenticateWithCredential(
              $user.object,
              EmailAuthProvider.credential(
                $user.object.email as string,
                formVal.data.password,
              ),
            )
            dispatch('reauthenticate', true)
          } catch (err: any) {
            alert.trigger('error', err.code, true)
          }
        }
      },
    },
  )

  const { form, enhance, delayed } = formResult
</script>

<form use:enhance class="w-full">
  <fieldset class="space-y-4" disabled={$delayed}>
    <div class="flex flex-col gap-1.5">
      <FormInput
        form={formResult}
        name="password"
        label="Password"
        type="password"
        bind:value={$form.password}
        autocomplete="current-password"
      />
    </div>
    <slot />
  </fieldset>
</form>
