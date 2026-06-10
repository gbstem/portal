<script lang="ts">
  import { cn } from '$lib/utils'
  import { uniqueId, kebabCase, isArray, isBoolean } from 'lodash-es'

  let className:
    | string
    | {
        input?: string
        container?: string
      } = ''
  export { className as class }

  export let self: HTMLInputElement | undefined = undefined
  export let id = uniqueId('input-')
  export let type = 'text'
  export let value: string | number | boolean | Array<string> | File = ''
  export let label = ''
  export let name = kebabCase(label)
  export let required = false
  export let floating = false
  export let validations: Array<Validation> = []
  export let focus = false
  export let placeholder: string | undefined = undefined

  // if file input
  export let accept: Array<string> | undefined = undefined
  export let maxSize = 0
  $: if (self && focus) {
    self.focus()
  }
  $: {
    if (self) {
      const state = (
        [
          [
            required &&
              (value === '' ||
                (self.files instanceof FileList && self.files.length === 0) ||
                (type === 'checkbox' && isArray(value) && value.length === 0)),
            'Please fill required fields.',
          ],
          ...(type === 'file' && value !== undefined
            ? [[(value as File).size > maxSize, 'File exceeds maximum size.']]
            : []),
          ...validations,
        ] as Array<Validation>
      ).find((validation) => validation[0])
      self.setCustomValidity(state === undefined ? '' : state[1])
    }
  }
  function handleInput(e: any) {
    if (e.target instanceof HTMLInputElement) {
      if (type === 'checkbox') {
        if (isArray(value)) {
          if (e.target.checked) {
            value = [name, ...value]
          } else {
            value = value.filter((item) => item !== name)
          }
        } else {
          value = e.target.checked
        }
      } else if (type === 'number' || type === 'range') {
        value = +e.target.value
      } else if (
        type === 'file' &&
        e.target.files instanceof FileList &&
        e.target.files[0] instanceof File
      ) {
        value = e.target.files[0]
      } else {
        value = e.target.value
      }
    }
  }
  let passwordVisible = false
</script>

{#if type === 'checkbox'}
  {#if isArray(value)}
    <div
      class={cn(
        'mt-2 flex',
        className instanceof Object && className.container,
      )}
    >
      <input
        class={cn(
          'peer mt-0.5 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400',
          typeof className === 'string' && className,
          className instanceof Object && className.input,
        )}
        type="checkbox"
        checked={value.includes(name)}
        bind:this={self}
        on:input={handleInput}
        {id}
        {name}
        {placeholder}
        {...$$restProps}
      />
      <label
        for={id}
        class="ml-2 cursor-pointer peer-disabled:cursor-default peer-disabled:text-gray-400"
      >
        <span>
          {label}
        </span>
      </label>
    </div>
  {:else}
    <div
      class={cn(
        'mt-2 flex',
        className instanceof Object && className.container,
      )}
    >
      <input
        class={cn(
          'peer mt-0.5 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:outline-hidden focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400',
          typeof className === 'string' && className,
          className instanceof Object && className.input,
        )}
        type="checkbox"
        checked={isBoolean(value) && value}
        bind:this={self}
        on:input={handleInput}
        {id}
        {name}
        {required}
        {placeholder}
        {...$$restProps}
      />
      <label
        for={id}
        class="ml-2 cursor-pointer peer-disabled:cursor-default peer-disabled:text-gray-400"
      >
        <span>
          {label}<span class="text-red-500">*</span>
        </span>
      </label>
    </div>
  {/if}
{:else if type === 'file'}
  <div class={cn('mt-2', className instanceof Object && className.container)}>
    <label for={id}>
      <span>
        {label}<span class="text-red-500">*</span>
      </span>
    </label>
    <input
      class={cn(
        'mt-2 block h-12 w-full cursor-pointer appearance-none rounded-md border border-gray-400 transition-colors file:mr-4 file:h-full file:cursor-pointer file:border-none file:bg-gray-700 file:px-4 file:text-white placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
        typeof className === 'string' && className,
        className instanceof Object && className.input,
      )}
      type="file"
      accept={accept === undefined ? undefined : accept.join(',')}
      bind:this={self}
      on:input={handleInput}
      {id}
      {name}
      {required}
      {placeholder}
      {...$$restProps}
    />
  </div>
{:else if floating}
  <div
    class={cn(
      'relative mt-2 grow',
      className instanceof Object && className.container,
    )}
  >
    <input
      class={cn(
        'peer block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 pt-1 transition-colors focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400',
        type === 'password' && 'pr-[2.85rem]',
        typeof className === 'string' && className,
        className instanceof Object && className.input,
      )}
      type={passwordVisible ? 'text' : type}
      placeholder=" "
      bind:this={self}
      on:input={handleInput}
      on:focusout={() => {
        if (passwordVisible) {
          passwordVisible = false
        }
      }}
      {value}
      {id}
      {name}
      {required}
      {...$$restProps}
    />
    <label
      class="absolute top-[0.65rem] left-1 z-10 origin-[0%_0%] -translate-y-4 transform cursor-text bg-white px-2 text-[0.8rem] leading-none text-gray-500 duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-placeholder-shown:text-base peer-focus:top-[0.65rem] peer-focus:left-1 peer-focus:-translate-y-4 peer-focus:text-[0.8rem] peer-focus:leading-none peer-disabled:text-gray-400"
      for={id}
    >
      <span>
        {label}<span class="text-red-500">*</span>
      </span>
    </label>
    {#if type == 'password'}
      <div class="absolute top-0 right-3 bottom-0 flex items-center">
        <button
          class="text-gray-500"
          type="button"
          on:click={() => {
            passwordVisible = !passwordVisible
          }}
        >
          {#if passwordVisible}
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
                d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            </svg>
          {:else}
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
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          {/if}
        </button>
      </div>
    {/if}
  </div>
{:else}
  <div class={cn('mt-2', className instanceof Object && className.container)}>
    <label for={id}>
      <span>
        {label}<span class={cn('text-red-500', !required && 'hidden')}>*</span>
      </span>
    </label>
    <input
      class={cn(
        'mt-1 block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
        typeof className === 'string' && className,
        className instanceof Object && className.input,
      )}
      bind:this={self}
      on:input={handleInput}
      {value}
      {type}
      {id}
      {name}
      {required}
      {placeholder}
      {...$$restProps}
    />
  </div>
{/if}

<style>
  input:checked {
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
  }
  input:not(:required) + label > span > span {
    display: none;
  }
  input:required:disabled + label > span > span {
    color: #fca5a5;
  }
</style>
