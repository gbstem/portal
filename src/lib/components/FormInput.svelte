<script lang="ts">
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { cn } from '$lib/utils'

  let className = ''
  export { className as class }

  export let form: any
  export let name: string
  export let label: string = ''
  export let required: boolean | undefined = undefined
  export let type = 'text'
  export let placeholder = ''
  export let value: any
  export let inputName: string = ''

  /**
   * Helper function to dynamically retrieve constraint values (e.g. min, max, minlength, maxlength, pattern, required)
   * defined in the Sveltekit-Superform Zod schema.
   * It takes the nested constraints object from `$form.constraints` (or `formResult.constraints` store value)
   * and walks down the dotted path name (e.g. 'personal.phoneNumber') to retrieve the field's constraints.
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
        <Label class="font-bold text-sm">
          {label}
          {#if isRequired}<span class="text-red-500">*</span>{/if}
        </Label>
      {/if}
      <input
        {...props}
        name={inputName || props.name}
        {type}
        {placeholder}
        required={isRequired}
        min={$$restProps.min ?? fieldConstraints?.min}
        max={$$restProps.max ?? fieldConstraints?.max}
        minlength={$$restProps.minlength ?? fieldConstraints?.minlength}
        maxlength={$$restProps.maxlength ?? fieldConstraints?.maxlength}
        pattern={$$restProps.pattern ?? fieldConstraints?.pattern}
        step={$$restProps.step ?? fieldConstraints?.step}
        bind:value
        class={cn(
          'block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400',
          className,
        )}
        {...$$restProps}
      />
    {/snippet}
  </Control>
  <FieldErrors class="text-xs text-red-500 font-semibold" />
</Field>
