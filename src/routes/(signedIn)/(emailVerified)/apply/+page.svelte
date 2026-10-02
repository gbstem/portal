<script lang="ts">
  import { goto } from '$app/navigation'
  import Button from '$lib/components/Button.svelte'
  import Card from '$lib/components/Card.svelte'
  import ApplyForm from '$lib/components/forms/ApplyForm.svelte'
  import RegistrationForm from '$lib/components/forms/RegistrationForm.svelte'
  import Select from '$lib/components/Select.svelte'
  import { semesterDates } from '$lib/data/collections'
  import { alert } from '$lib/stores'
  import { ExclamationCircle } from '@steeze-ui/heroicons'
  import { Icon } from '@steeze-ui/svelte-icon'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()

  // A parent picks which child's registration to show by `?child=`, which
  // `load` reads - see `loadRegistrationPage` in +page.server.ts.
  const selectedName = $derived(
    data.page === 'registration'
      ? (data.children.find((child) => child.number === data.childNumber)
          ?.name ?? '')
      : '',
  )

  function openChild(childNumber: number) {
    if (data.page !== 'registration' || childNumber === data.childNumber) {
      return
    }
    // keepFocus: when the other child's form lands, SvelteKit would otherwise
    // move focus back to the page - away from the picker, or from a field the
    // parent has gone on to in the meantime.
    goto(`?child=${childNumber}`, { noScroll: true, keepFocus: true })
  }

  function selectChild(name: string) {
    if (data.page !== 'registration') return
    const child = data.children.find((c) => c.name === name)
    if (child) openChild(child.number)
  }

  function addChild() {
    if (data.page !== 'registration') return
    if (data.children.length >= data.maxChildren) {
      alert.trigger(
        'error',
        `You can only register up to ${data.maxChildren} children`,
      )
      return
    }
    openChild(data.children.length + 1)
  }
</script>

<svelte:head>
  <title>Apply</title>
</svelte:head>

{#if data.page === 'application'}
  <h1 class="mb-4 text-5xl font-bold md:text-6xl">Apply</h1>
  <div class="mx-auto flex max-w-6xl flex-col items-center px-2 py-8 md:px-8">
    <ApplyForm
      data={data.applyForm}
      application={data.application}
      email={data.user?.email ?? ''}
      {semesterDates}
    />
  </div>
{:else if data.page === 'registration'}
  <h1 class="mb-4 text-5xl font-bold md:text-6xl">Student Account Creation</h1>
  <div class="mx-auto flex max-w-6xl flex-col items-center px-2 py-8 md:px-8">
    <div class="w-full">
      {#if data.children.length > 0}
        <div class="font-bold">Your Existing Accounts</div>
        <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
          <div class="sm:col-span-2">
            {#key data.children.map((child) => child.name).join('\n')}
              <Select
                value={selectedName}
                onchange={selectChild}
                class="mr-2 w-full"
                label="Select a child"
                options={data.children.map((child) => ({ name: child.name }))}
              />
            {/key}
          </div>
          <div class="flex justify-end">
            <Button
              onclick={addChild}
              color="blue"
              class="px-2 py-1"
              type="button">Add Child Account</Button
            >
          </div>
        </div>
      {/if}
      {#if data.registrationForm && data.registration}
        <Card class="mx-auto mt-4 w-fit">
          <!-- Keyed by child, so switching children starts a fresh form rather
               than carrying one child's unsaved edits over to another. -->
          {#key data.childNumber}
            <RegistrationForm
              data={data.registrationForm}
              registration={data.registration}
              window={data.registrationWindow}
              childNumber={data.childNumber}
              email={data.user?.email ?? ''}
              {semesterDates}
            />
          {/key}
        </Card>
      {:else}
        <!-- Nothing may be created before registration opens, so a parent
             with no registration yet gets only this. -->
        <Card class="mx-auto mt-4 mb-6 max-w-2xl border-red-200 bg-red-50">
          <div class="flex items-start gap-3">
            <Icon
              src={ExclamationCircle}
              class="mt-0.5 size-6 shrink-0 text-red-600"
            />
            You may register for the upcoming semester starting on
            <b>{new Date(semesterDates.registrationsOpen).toDateString()}</b>.
          </div>
        </Card>
      {/if}
    </div>
  </div>
{/if}
