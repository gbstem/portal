<script lang="ts">
  import Button from '#lib/components/Button.svelte'
  import Card from '#lib/components/Card.svelte'
  import { alert } from '#lib/stores.js'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  let summary = $derived(data.summary)
  let sending = $state(false)

  async function sendEmail() {
    sending = true
    try {
      const response = await fetch('/api/communityService', { method: 'POST' })
      if (response.ok) {
        alert.trigger('success', 'Email sent successfully!')
      } else {
        alert.trigger('error', 'Failed to send email.')
      }
    } catch {
      alert.trigger('error', 'Failed to send email.')
    } finally {
      sending = false
    }
  }
</script>

<svelte:head>
  <title>Community Service Hours Tracker</title>
</svelte:head>

<h1 class="mb-4 text-5xl font-bold md:text-6xl">
  Community Service Hours Tracker
</h1>

<div class="mx-auto max-w-6xl px-2 py-8 md:px-8">
  <div class="relative w-full">
    <Card>
      <div class="p-2">
        <h2 class="text-lg font-bold">
          You have completed {summary.classSessions + summary.subSessions} classes
          equaling {summary.totalHours} total hours (including prep time) of community
          service this year!
        </h2>
        <div>
          You have completed <strong>{summary.classHours}</strong>
          hour{summary.classHours === 1 ? '' : 's'} of instruction for your class
          and <strong>{summary.subHours}</strong> hour{summary.subHours === 1
            ? ''
            : 's'} as a substitute instructor. Thank you for contributing to gbSTEM.
        </div>
        <Button color="blue" class="mt-2" onclick={sendEmail} disabled={sending}
          >Get Hours Confirmation Email</Button
        >
      </div>
    </Card>
  </div>
</div>
