<script lang="ts">
  import '../app.css'
  import Alert from '$lib/components/Alert.svelte'
  import Footer from '$lib/components/Footer.svelte'
  import { navigating } from '$app/stores'
  import { onMount } from 'svelte'
  import progress from '$lib/client/progress'
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()

  onMount(() => {
    return navigating.subscribe((navigating) => {
      if (navigating) {
        progress.start()
      } else {
        progress.done()
      }
    })
  })
</script>

<div class="flex min-h-screen flex-col">
  <div class="flex grow flex-col">
    {@render children?.()}
  </div>
  <Footer />
</div>
<Alert />
