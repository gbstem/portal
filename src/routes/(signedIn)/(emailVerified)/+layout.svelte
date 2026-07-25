<script lang="ts">
  import { user } from '$lib/client/firebase'
  import { onMount } from 'svelte'
  interface Props {
    children?: import('svelte').Snippet
  }

  let { children }: Props = $props()

  onMount(() =>
    user.subscribe(async (u) => {
      if (u) {
        if (localStorage.getItem('emailVerified') === 'false') {
          try {
            await u.object.reload()
            await u.object.getIdToken(true)
            localStorage.removeItem('emailVerified')
          } catch (err) {
            console.error('Failed to reload user or get id token:', err)
          }
        }
      }
    }),
  )
</script>

{@render children?.()}
