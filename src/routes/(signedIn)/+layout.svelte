<script lang="ts">
  import Nav from '$lib/components/Nav.svelte'
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()
</script>

<Nav />
<div class="grow">
  <main class="mt-20 px-d py-8">
    {@render children?.()}
  </main>
</div>
