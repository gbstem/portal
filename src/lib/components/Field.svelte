<script lang="ts">
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }
</script>

<div class={cn('rounded-md bg-gray-100 px-3 py-2 shadow-xs', className)}>
  <slot />
</div>
