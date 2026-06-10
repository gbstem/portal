<script lang="ts">
  import { cn } from '$lib/utils'

  type ButtonColor = 'red' | 'blue' | 'gray' | 'green' | 'yellow' | 'purple'
  type ButtonType = 'button' | 'submit' | 'reset'

  let className = ''
  export { className as class }
  export let color: ButtonColor = 'gray'
  export let type: ButtonType = 'button'
  export let href: string | undefined = undefined
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  class={cn(
    'inline-flex items-center justify-center gap-2 font-semibold rounded-md px-4 py-2 min-h-10 min-w-10 shadow-xs transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2',
    'hover:shadow-md active:shadow-sm',
    'disabled:cursor-not-allowed',
    color === 'red' &&
      'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:text-white focus-visible:ring-red-400',
    color === 'blue' &&
      'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:text-white focus-visible:ring-blue-400',
    color === 'gray' &&
      'bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-300 disabled:text-white focus-visible:ring-gray-400',
    color === 'green' &&
      'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 disabled:text-white focus-visible:ring-green-400',
    color === 'yellow' &&
      'bg-yellow-500 text-white hover:bg-yellow-600 disabled:bg-yellow-200 disabled:text-white focus-visible:ring-yellow-300',
    color === 'purple' &&
      'bg-purple-900 text-white hover:bg-purple-700 disabled:bg-purple-200 disabled:text-white focus-visible:ring-purple-400',
    className,
  )}
  {href}
  type={href ? undefined : type}
  role={href ? 'button' : undefined}
  on:click
  on:change
  on:keydown
  on:keyup
  on:touchstart
  on:touchend
  on:touchcancel
  on:mouseenter
  on:mouseleave
  {...$$restProps}
>
  <slot />
</svelte:element>
