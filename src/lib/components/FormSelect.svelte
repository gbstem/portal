<script lang="ts">
  import Select from '$lib/components/Select.svelte'
  import { Control, Field, FieldErrors } from 'formsnap'

  let className = ''
  export { className as class }

  export let form: any
  export let name: string
  export let label: string = ''
  export let required: boolean | undefined = undefined
  export let value: string
  export let options: any[]
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
      <Select
        {...props}
        name={inputName || props.name}
        class={className}
        {label}
        {options}
        required={isRequired}
        bind:value
        {...$$restProps}
      />
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
