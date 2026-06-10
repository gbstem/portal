<script lang="ts">
  import { db, storage, user } from '$lib/client/firebase'
  import Dialog from '$lib/components/Dialog.svelte'
  import { decisionsCollection } from '$lib/data/constants'
  import { alert } from '$lib/stores'
  import {
    EmailAuthProvider,
    deleteUser,
    reauthenticateWithCredential,
  } from 'firebase/auth'
  import { deleteDoc, doc } from 'firebase/firestore'
  import { deleteObject, ref } from 'firebase/storage'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import DialogActions from '../DialogActions.svelte'
  import FormInput from '../FormInput.svelte'

  const schema = z.object({
    password: z.string().min(1, 'Password is required'),
  })

  let dialogEl: Dialog

  const formResult = superForm(
    defaults({ password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          try {
            await reauthenticateWithCredential(
              frozenUser.object,
              EmailAuthProvider.credential(
                frozenUser.object.email as string,
                formVal.data.password,
              ),
            )
            const id = frozenUser.profile.id
            const resumeRef = ref(
              storage,
              `resumes/${frozenUser.object.uid}.pdf`,
            )
            await Promise.all(
              [
                deleteObject(resumeRef),
                deleteDoc(doc(db, 'applications', frozenUser.object.uid)),
                deleteDoc(doc(db, decisionsCollection, frozenUser.object.uid)),
              ].map((p) => p.catch((e) => e)),
            )
            await Promise.all([
              deleteDoc(doc(db, 'ids', id)),
              deleteDoc(doc(db, 'users', frozenUser.object.uid)),
            ])
            await deleteUser(frozenUser.object)
            alert.trigger('success', 'Account was successfully deleted.')
            window.setTimeout(() => {
              location.reload()
            }, 2000)
          } catch (err: any) {
            alert.trigger('error', err.code, true)
          }
        }
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult

  function handleCancel() {
    reset()
    alert.trigger('info', 'Account deletion canceled.')
  }
</script>

<div class="w-full">
  <span class="font-bold">Delete account</span>
  <div class="mt-2">
    <Button color="red" type="button" on:click={() => dialogEl.open()}
      >Delete account</Button
    >
  </div>
</div>

<Dialog bind:this={dialogEl} on:cancel={handleCancel} disabled={$delayed} alert>
  <svelte:fragment slot="title">Delete account</svelte:fragment>
  <div slot="description" class="flex w-full justify-center">
    <form use:enhance class="w-full max-w-lg">
      <fieldset class="space-y-4" disabled={$delayed}>
        <div class="flex justify-center">
          <div class="w-full space-y-4">
            <FormInput
              form={formResult}
              name="password"
              label="Password"
              type="password"
              bind:value={$form.password}
              autocomplete="current-password"
            />
            <div class="text-center font-bold text-red-600">
              Warning! This is irreversible.
            </div>
          </div>
        </div>
        <DialogActions>
          <Button type="button" on:click={dialogEl.cancel}>Cancel</Button>
          <Button color="red" type="submit" disabled={$delayed}>Delete</Button>
        </DialogActions>
      </fieldset>
    </form>
  </div>
</Dialog>
