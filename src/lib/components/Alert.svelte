<script lang="ts">
  import { alert } from '$lib/stores'
  import { navigating } from '$app/stores'
  import { fade } from 'svelte/transition'
  import { onDestroy, onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { cn } from '$lib/utils'

  let timer: number | undefined
  let visible = false
  $: if (browser && $navigating) {
    if (visible) {
      close()
    }
  }
  onMount(() => {
    return alert.subscribe((alert) => {
      if (alert.type !== null) {
        if (visible) {
          clearTimeout(timer)
        } else {
          visible = true
        }
        setCloseTimeout()
      }
    })
  })
  onDestroy(() => {
    clearTimeout(timer)
  })
  function setCloseTimeout() {
    timer = window.setTimeout(() => {
      close()
    }, 3000)
  }
  function close() {
    visible = false
    clearTimeout(timer)
    timer = undefined
    alert.clear()
  }
  function handleEscape(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      close()
    }
  }
</script>

<svelte:document on:keydown={visible ? handleEscape : undefined} />
{#if visible}
  <div
    class="fixed bottom-3 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 px-3"
  >
    <button class="w-full" type="button" on:click={close} transition:fade>
      <div
        class={cn(
          'flex w-full items-center gap-2 rounded-md p-3 shadow-sm',
          $alert.type === 'success' && 'bg-green-200',
          $alert.type === 'info' && 'bg-gray-200',
          $alert.type === 'error' && 'bg-red-200',
        )}
      >
        <div class="shrink-0">
          {#if $alert.type === 'success'}
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
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          {:else if $alert.type === 'info'}
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
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
          {:else if $alert.type === 'error'}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="h-6 w-6 shrink-0"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          {/if}
        </div>
        <p class="grow text-left">{$alert.message}</p>
      </div>
    </button>
  </div>
{/if}
