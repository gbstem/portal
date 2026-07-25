<script lang="ts">
  import Select from '$lib/components/Select.svelte'
  import { Control, Field, FieldErrors } from 'formsnap'

  interface Props {
    class?: string
    form: any
    name: string
    label?: string
    required?: boolean | undefined
    value: string
    options: any[]
    inputName?: string
    [key: string]: any
  }

  let {
    class: className = '',
    form,
    name,
    label = '',
    required = undefined,
    value = $bindable(),
    options,
    inputName = '',
    ...rest
  }: Props = $props()

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

  let fieldConstraints = $derived(getConstraint(form?.constraints, name))
  let isRequired = $derived(required ?? fieldConstraints?.required ?? false)
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
        {...rest}
      />
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
