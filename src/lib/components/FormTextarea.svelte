<script lang="ts">
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }

  export let form: any
  export let name: string
  export let label: string = ''
  export let required: boolean | undefined = undefined
  export let placeholder = ''
  export let value: any
  export let inputName: string = ''

  /**
   * Helper function to dynamically retrieve constraint values (e.g. minlength, maxlength, required)
   * defined in the Sveltekit-Superform Zod schema.
   * It walks down the dotted path name (e.g. 'essay.academicBackground') within the constraints object.
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
      {#if label}
        <Label class="text-sm font-bold">
          {label}
          {#if isRequired}<span class="text-red-500">*</span>{/if}
        </Label>
      {/if}
      <textarea
        {...props}
        name={inputName || props.name}
        {placeholder}
        required={isRequired}
        minlength={$$restProps.minlength ?? fieldConstraints?.minlength}
        maxlength={$$restProps.maxlength ?? fieldConstraints?.maxlength}
        bind:value
        class={cn(
          'block min-h-[120px] w-full appearance-none rounded-md border border-gray-400 p-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400',
          className,
        )}
        {...$$restProps}
      ></textarea>
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
