<script lang="ts">
  import { cn } from '$lib/utils'
  import { createEventDispatcher } from 'svelte'

  interface Props {
    class: string
    children?: import('svelte').Snippet
    [key: string]: any
  }

  let { class: className, children, ...rest }: Props = $props()

  const dispatch = createEventDispatcher<{
    submit: SubmitData
  }>()
  let self: HTMLFormElement | undefined = $state()

  function handleSubmit(e: SubmitEvent) {
    if (!self) return
    const state = [
      ...Array.from(self.querySelectorAll('input')),
      ...Array.from(self.querySelectorAll('textarea')),
    ].find((el) => !el.checkValidity())
    dispatch('submit', {
      event: e,
      error: state === undefined ? null : state.validationMessage,
    })
  }
</script>

<form
  class={cn('w-full', className)}
  novalidate
  bind:this={self}
  onsubmit={(e) => {
    e.preventDefault()
    handleSubmit(e)
  }}
  {...rest}
>
  {@render children?.()}
</form>
