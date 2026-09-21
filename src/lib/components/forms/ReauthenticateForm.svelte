<script lang="ts">
  import { user } from '$lib/client/firebase'
  import { alert } from '$lib/stores'
  import {
    EmailAuthProvider,
    reauthenticateWithCredential,
  } from 'firebase/auth'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import FormInput from '../FormInput.svelte'
  interface Props {
    // Returns a promise so `onUpdate` below can await it. See the
    // `invalidateAll: false` comment for why that ordering matters.
    onReauthenticate?: () => void | Promise<void>
    children?: import('svelte').Snippet
  }

  let { onReauthenticate, children }: Props = $props()

  const schema = z.object({
    password: z.string().min(1, 'Password is required'),
  })

  const formResult = superForm(
    defaults({ password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      // This dialog renders no server-loaded data, so it has nothing to
      // revalidate - and superforms' default (`invalidateAll: true`) actively
      // broke the flows that use it. It fires *after* `onUpdate` resolves,
      // racing whatever mutation `onReauthenticate` kicked off: changing a
      // password bumps Firebase's `tokensValidAfterTime`, which revokes the
      // `__session` cookie that hooks.server.ts checks with `checkRevoked`,
      // so whichever request landed second decided whether you stayed on the
      // page or got bounced to /signin.
      //
      // The three sibling forms (ChangeName/ChangeEmail/ChangePassword) all
      // already opt out the same way. Admin carries the identical fix - the
      // same race failed its profile.cy.ts in about half of CI runs, where
      // this repo's profile spec happened not to look.
      invalidateAll: false,
      applyAction: false,
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
            // Awaited, so the caller's mutation is complete (and its
            // success/error alert triggered) before this form's submit
            // settles. Firing it loose left two async chains in flight with
            // no defined order.
            await onReauthenticate?.()
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
    {@render children?.()}
  </fieldset>
</form>
