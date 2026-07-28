<script lang="ts">
  import { navigating, page } from '$app/state'
  import { db, user } from '$lib/client/firebase'
  import { decisionsCollection } from '$lib/data/collections'
  import { cn } from '$lib/utils'
  import { doc, getDoc } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import { cubicInOut } from 'svelte/easing'
  import { fade } from 'svelte/transition'
  import Brand from './Brand.svelte'
  import ProfileMenu from './ProfileMenu.svelte'

  let userRole = $derived($user?.profile?.role)
  let shadow = $state(false)
  let open = $state(false)
  let showAdditionalPages = $state(false)

  // Reactive statement to update the forms page name based on user role
  let pages = $derived([
    { name: 'Dashboard', href: '/dashboard' },
    { name: userRole === 'student' ? 'Register' : 'Apply', href: '/apply' },
    { name: 'Classes', href: '/classes' },
    // { name: 'FAQ', href: '/faq' },
    ...(showAdditionalPages
      ? [
          {
            name: 'Community Service Hours Tracker',
            href: '/community-service',
          },
        ]
      : []),
  ])

  // Only fetch document when user is loaded, has a uid, and is an instructor
  $effect(() => {
    const uid = $user?.object?.uid
    if (!uid || userRole !== 'instructor') return
    let cancelled = false
    ;(async () => {
      try {
        const document = await getDoc(doc(db, decisionsCollection, uid))
        if (cancelled) return
        if (document.exists() && document.data().type === 'accepted') {
          showAdditionalPages = true
        }
      } catch (error) {
        console.error('Error fetching document:', error)
      }
    })()
    return () => {
      cancelled = true
    }
  })

  onMount(() => {
    updateShadow()
  })
  $effect(() => {
    if (navigating.to) {
      open = false
    }
  })
  let pathname = $derived(page.url.pathname)

  function updateShadow() {
    shadow = window.scrollY !== 0
  }
</script>

<svelte:window onscroll={updateShadow} />
<nav
  class={cn(
    'fixed top-0 left-0 z-40 flex h-20 w-full items-center justify-between gap-2 border-b bg-white/70 px-4 backdrop-blur-md transition-all duration-300 md:gap-4 md:px-6 lg:gap-6 lg:px-8',
    shadow && !open ? 'shadow-b border-gray-200' : 'border-white',
  )}
  style="backdrop-filter: blur(12px);"
>
  {#await pages then pages}
    <Brand />
    {#if $user?.object?.emailVerified}
      <div
        class="no-scrollbar hidden min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto px-2 py-1 sm:flex md:gap-1 lg:justify-center lg:gap-1.5 xl:gap-2"
      >
        {#each pages as page (page.href)}
          <a
            class={cn(
              'relative flex min-h-10 max-w-30 shrink-0 items-center justify-center rounded-full px-1.5 py-1 text-center text-[11px] leading-tight font-medium transition-colors duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 md:px-2 md:py-1.5 md:text-xs lg:px-2.5 lg:py-2 lg:text-sm xl:px-4 xl:text-base',
              pathname === page.href
                ? 'bg-blue-100 text-blue-700 shadow-xs'
                : 'hover:bg-gray-100 hover:text-blue-600',
            )}
            href={page.href}
            aria-current={pathname === page.href ? 'page' : undefined}
            tabindex="0"
          >
            {page.name}
            {#if pathname === page.href}
              <span
                class="absolute right-2 -bottom-1 left-2 h-1 rounded-full bg-blue-400/70"
                style="z-index:1;"
              ></span>
            {/if}
          </a>
        {/each}
      </div>
    {/if}
    <div class="flex items-center gap-1 sm:gap-3 md:gap-4">
      <ProfileMenu class="hidden sm:block" />
      <button
        class="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 sm:hidden"
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onclick={() => {
          open = !open
        }}
      >
        {#if open}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="h-8 w-8"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="h-8 w-8"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 9h16.5m-16.5 6.75h16.5"
            />
          </svg>
        {/if}
      </button>
    </div>
  {/await}
</nav>
{#if open}
  <div
    class="animate-slideDown fixed top-20 left-0 z-50 flex h-[calc(100vh-5rem)] w-screen flex-col gap-2 border-t border-gray-200 bg-white/90 p-d shadow-lg backdrop-blur-md sm:hidden"
    transition:fade={{
      easing: cubicInOut,
      duration: 200,
    }}
    style="backdrop-filter: blur(12px);"
  >
    {#if $user?.object?.emailVerified}
      {#each pages as page (page.href)}
        <a
          class={cn(
            'rounded-full px-3 py-2 font-medium transition-colors duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400',
            pathname === page.href
              ? 'bg-blue-100 text-blue-700 shadow-xs'
              : 'hover:bg-gray-100 hover:text-blue-600',
          )}
          href={page.href}
          aria-current={pathname === page.href ? 'page' : undefined}
          tabindex="0"
        >
          {page.name}
        </a>
      {/each}
    {/if}
    <div class={cn($user?.object?.emailVerified && 'mt-d')}>
      <ProfileMenu />
    </div>
  </div>
{/if}

<style>
  .shadow-b {
    box-shadow: 0 1px 2px -1px rgb(0 0 0 / 0.1);
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  @media (max-width: 640px) {
    .animate-slideDown {
      animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  }
</style>
