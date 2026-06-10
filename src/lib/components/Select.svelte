<script context="module" lang="ts">
  type SelectData = {
    id: string
    setOpen: (newState: boolean) => void
  }
  let current: SelectData

  function registerOpenSelect(
    id: string,
    setOpen: (newState: boolean) => void,
  ) {
    if (current && current.id !== id) {
      current.setOpen(false)
    }
    current = { id, setOpen }
  }
</script>

<script lang="ts">
  import { clickOutside, cn } from '$lib/utils'
  import { debounce, kebabCase, uniqueId } from 'lodash-es'
  import { fade } from 'svelte/transition'

  let className = ''
  export { className as class }

  export let self: HTMLInputElement | undefined = undefined
  export let id = uniqueId('select-')
  export let value: string
  export let label = ''
  export let name = kebabCase(label)
  export let required = false
  export let placeholder: string | undefined = undefined
  type SelectOption = string
  type SelectOptionJson = {
    name: string
    [key: string]: any
  }
  let optionsJson: Array<SelectOptionJson> = []
  export { optionsJson as options }

  let open = false
  let selectedOptionIndex = 0

  $: options = optionsJson.map((item) => item.name)
  $: if (options) {
    filterOptionsBy(value)
  }
  let filteredOptions: Array<SelectOption> = []
  const filterOptionsBy = debounce((givenValue) => {
    const val = givenValue ?? ''
    if (val === '') {
      filteredOptions = options
    } else {
      const lowerCaseValue = val.toLowerCase()
      filteredOptions = options.filter(
        (name) => name && name.toLowerCase().indexOf(lowerCaseValue) !== -1,
      )
    }
  }, 150)

  // Handle open state changes without causing infinite loops
  let previousOpenState = false
  $: if (open !== previousOpenState) {
    previousOpenState = open
    if (open) {
      registerOpenSelect(id, (newValue) => {
        if (newValue !== open) {
          open = newValue
        }
      })
    } else {
      // validate value before close
      if (!options.includes(value)) {
        value = ''
      }
    }
  }

  // Handle value validation separately to prevent loops
  let previousValue = value
  $: if (value !== previousValue) {
    previousValue = value
    filterOptionsBy(value)
    if (self) {
      if (value === '' && required) {
        self.setCustomValidity('Please fill required fields.')
      } else {
        if (options.includes(value)) {
          self.setCustomValidity('')
        } else {
          self.setCustomValidity('Please select valid options.')
        }
      }
    }
  }

  filterOptionsBy(value)

  function handleInput(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
  ) {
    if (!open) {
      open = true
    }
    selectedOptionIndex = 0
    value = (e.target as HTMLInputElement).value
  }
  function handleKeyDown(e: KeyboardEvent) {
    switch (e.code) {
      case 'Escape':
        open = false
        break
      case 'Enter':
        e.preventDefault()
        open = false
        value = filteredOptions[selectedOptionIndex]
        break
      case 'Tab':
        if (open) {
          e.preventDefault()
          open = false
          value = filteredOptions[selectedOptionIndex]
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (selectedOptionIndex !== 0) {
          --selectedOptionIndex
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (selectedOptionIndex !== filteredOptions.length - 1) {
          ++selectedOptionIndex
        }
        break
    }
  }
  function handleFocusIn() {
    selectedOptionIndex = 0
    if (value === '') {
      filteredOptions = options
    } else {
      filteredOptions = [value, ...options.filter((name) => name !== value)]
    }
    open = true
  }
</script>

<div
  class={cn('relative mt-2', className)}
  use:clickOutside
  on:outclick={() => {
    open = false
  }}
>
  <label for={id} class="text-sm font-bold">
    <span>
      {label}<span class={cn('text-red-500', !required && 'hidden')}>*</span>
    </span>
  </label>
  <div class="relative">
    <div class="absolute top-0 right-0 flex h-12 items-center pr-2">
      <button
        type="button"
        aria-label="Toggle dropdown"
        on:click={() => {
          open = !open
          if (open && self) {
            self.focus()
          }
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="h-6 w-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
          />
        </svg>
      </button>
    </div>
    <input
      class={cn(
        'mt-1 block h-12 w-full appearance-none rounded-md border border-gray-400 pl-3 pr-9 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
        className,
      )}
      type="text"
      data-1p-ignore
      bind:this={self}
      on:input={handleInput}
      on:keydown={handleKeyDown}
      on:focusin={handleFocusIn}
      {value}
      {id}
      {name}
      {required}
      {placeholder}
      {...$$restProps}
    />
    {#if open}
      <div
        class="absolute top-14 left-0 z-20 max-h-60 w-full overflow-hidden overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-xs"
        transition:fade={{ duration: 100 }}
      >
        {#if filteredOptions.length === 0}
          <div class="w-full px-6 py-2 text-left">Nothing found.</div>
        {:else if filteredOptions.length === 1}
          <button
            class="w-full bg-gray-100 px-6 py-2 text-left transition-colors duration-300"
            type="button"
            on:click={() => {
              value = filteredOptions[0]
              open = false
            }}
          >
            {filteredOptions[0]}
          </button>
        {:else}
          {#each filteredOptions as name, index}
            <button
              class={cn(
                'w-full px-6 py-2 text-left transition-colors duration-300',
                index === selectedOptionIndex && 'bg-gray-100',
              )}
              type="button"
              on:click={() => {
                value = name
                open = false
              }}
              on:mouseenter={() => {
                selectedOptionIndex = index
              }}
            >
              {name}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</div>
