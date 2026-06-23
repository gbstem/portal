<script lang="ts">
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }
</script>

<div
  class={cn(
    'w-full rounded-md border border-gray-200 bg-white p-4 shadow-sm md:p-6',
    className,
  )}
>
  <slot />
</div>
