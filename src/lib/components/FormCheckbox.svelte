<script lang="ts">
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }

  export let form: any
  export let name: string
  export let label: string = ''
  export let checked: boolean
  export let required: boolean | undefined = undefined
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
      <div class="flex items-center">
        <input
          {...props}
          name={inputName || props.name}
          type="checkbox"
          bind:checked
          required={isRequired}
          class={cn(
            'peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:outline-hidden focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400',
            className,
          )}
          {...$$restProps}
        />
        {#if label}
          <Label
            class="ml-2 cursor-pointer peer-disabled:cursor-default peer-disabled:text-gray-400 font-bold text-sm"
          >
            {label}
            {#if isRequired}<span class="text-red-500">*</span>{/if}
          </Label>
        {/if}
      </div>
    {/snippet}
  </Control>
  <FieldErrors class="text-xs text-red-500 font-semibold" />
</Field>
