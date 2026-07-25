<script lang="ts">
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()
</script>

<main class="flex grow items-center justify-center px-d py-8">
  {@render children?.()}
</main>
