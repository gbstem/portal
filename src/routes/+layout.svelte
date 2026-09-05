<script lang="ts">
  import '../app.css'
  import Alert from '$lib/components/Alert.svelte'
  import Footer from '$lib/components/Footer.svelte'
  import StaleClientBanner from '$lib/components/StaleClientBanner.svelte'
  import { navigating } from '$app/state'
  import progress from '$lib/client/progress'
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()

  $effect(() => {
    if (navigating.to) {
      progress.start()
    } else {
      progress.done()
    }
  })
</script>

<div class="flex min-h-screen flex-col">
  <StaleClientBanner />
  <div class="flex grow flex-col">
    {@render children?.()}
  </div>
  <Footer />
</div>
<Alert />
