<script lang="ts">
  import Nav from '$lib/components/Nav.svelte'
</script>

<Nav />
<div class="grow">
  <main class="mt-20 px-d py-8">
    <slot />
  </main>
</div>
