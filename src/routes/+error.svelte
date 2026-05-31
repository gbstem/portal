<script lang="ts">
  import { page } from '$app/stores'
</script>

<svelte:head>
  <title>Database Error</title>
</svelte:head>

<div class="flex grow items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
  <div class="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
    <div class="text-center">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-10 w-10">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-950">Database or Server Error</h2>
      <p class="mt-2 text-center text-sm text-gray-500">
        An error occurred while loading this page. Please share the details below with the gbSTEM website maintainers.
      </p>
    </div>

    <div class="rounded-xl border border-red-200 bg-red-50/50 p-4">
      <div class="text-xs font-semibold uppercase tracking-wider text-red-800">Error Message</div>
      <p class="mt-1 text-sm font-medium text-red-900 break-words">{$page.error?.message || 'Something went wrong.'}</p>
      
      {#if $page.error?.details}
        <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-red-800">Technical Details</div>
        <pre class="mt-1 max-h-40 overflow-y-auto rounded-lg bg-red-900/10 p-2 font-mono text-xs text-red-950 whitespace-pre-wrap break-all">{$page.error.details}</pre>
      {/if}
      
      {#if $page.error?.code}
        <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-red-800">Error Code</div>
        <code class="mt-1 block font-mono text-xs text-red-900">{$page.error.code}</code>
      {/if}
    </div>

    <div class="flex gap-4">
      <button
        on:click={() => window.location.reload()}
        class="flex w-full justify-center rounded-lg bg-blue-600 py-3 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition"
      >
        Try Again
      </button>
      <a
        href="/"
        class="flex w-full justify-center rounded-lg border border-gray-300 bg-white py-3 px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 transition"
      >
        Go to Home
      </a>
    </div>
  </div>
</div>
