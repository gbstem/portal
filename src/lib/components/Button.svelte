<script lang="ts">
  import { cn } from '$lib/utils'
  import { createEventDispatcher } from 'svelte'

  type ButtonColor = 'red' | 'blue' | 'gray' | 'green' | 'yellow'
  type ButtonType = 'button' | 'submit' | 'reset'

  const dispatch = createEventDispatcher<{
    click: MouseEvent & {
      currentTarget: EventTarget & HTMLButtonElement
    }
  }>()

  let className = ''
  export { className as class }
  export let color: ButtonColor = 'gray'
  export let type: ButtonType = 'button'
</script>

<button
  class={cn(
    'inline-flex items-center justify-center gap-2 font-semibold rounded-md px-4 py-2 min-h-10 min-w-10 shadow-xs transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2',
    'hover:shadow-md active:shadow-sm',
    'disabled:cursor-not-allowed',
    color === 'red' &&
      'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:text-white focus-visible:ring-red-400',
    color === 'blue' &&
      'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:text-white focus-visible:ring-blue-400',
    color === 'gray' &&
      'bg-gray-200 text-gray-900 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 focus-visible:ring-gray-300',
    color === 'green' &&
      'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 disabled:text-white focus-visible:ring-green-400',
    color === 'yellow' &&
      'bg-yellow-500 text-white hover:bg-yellow-600 disabled:bg-yellow-200 disabled:text-white focus-visible:ring-yellow-300',
    className,
  )}
  {type}
  on:click={(e) => dispatch('click', e)}
  {...$$restProps}
>
  <slot />
</button>
