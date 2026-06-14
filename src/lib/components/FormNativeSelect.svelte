<script lang="ts">
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }

  export let form: any
  export let name: string
  export let label: string = ''
  export let required: boolean | undefined = undefined
  export let value: any
  export let inputName: string = ''

  /**
   * Helper function to dynamically retrieve constraint values (e.g. required)
   * defined in the Sveltekit-Superform Zod schema.
   * It walks down the dotted path name within the constraints object.
   */
  function getConstraint(constraints: any, path: string): any {
    if (!constraints || !path) return {}
    const parts = path.split('.')
    let current = constraints
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        return {}
      }
    }
    return current || {}
  }

  const constraintsStore = form.constraints
  $: fieldConstraints = getConstraint($constraintsStore, name)
  $: isRequired = required ?? fieldConstraints?.required ?? false
</script>

<Field {form} {name}>
  <Control>
    {#snippet children({ props })}
      <div class="relative mt-2">
        {#if label}
          <Label class="text-sm font-bold">
            {label}
            {#if isRequired}<span class="text-red-500">*</span>{/if}
          </Label>
        {/if}
        <select
          {...props}
          name={inputName || props.name}
          required={isRequired}
          bind:value
          class={cn(
            'mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400',
            className,
          )}
          {...$$restProps}
        >
          <slot />
        </select>
      </div>
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
