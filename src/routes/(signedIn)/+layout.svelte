<script lang="ts">
  import Nav from '$lib/components/Nav.svelte'
  import type { LayoutData } from './$types'

  export let data: LayoutData
</script>

<Nav />
<div class="grow">
  <main class="mt-20 px-d py-8">
    <slot />
  </main>
</div>
