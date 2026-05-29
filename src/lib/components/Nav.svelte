<script lang="ts">
  import ProfileMenu from './ProfileMenu.svelte'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import Brand from './Brand.svelte'
  import { navigating } from '$app/stores'
  import { fade } from 'svelte/transition'
  // import AnnouncementsBell from './AnnouncementsBell.svelte'
  import { cubicInOut } from 'svelte/easing'
  import { cn } from '$lib/utils'
  import { doc, getDoc } from 'firebase/firestore'
  import { decisionsCollection } from '$lib/data/constants'
  import { db } from '$lib/client/firebase'
  import { user } from '$lib/client/firebase'

  $: userRole = $user?.profile?.role
  let shadow = false
  let open = false
  let showAdditionalPages = false

  // Reactive statement to update the forms page name based on user role
  $: pages = [
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
  ]

  // Only fetch document when user is loaded, has a uid, and is an instructor
  $: if ($user?.object?.uid && userRole === 'instructor') {
    ;(async () => {
      try {
        const document = await getDoc(
          doc(db, decisionsCollection, $user.object.uid),
        )
        if (document.exists() && document.data().type === 'accepted') {
          showAdditionalPages = true
        }
      } catch (error) {
        console.error('Error fetching document:', error)
      }
    })()
  }

  onMount(() => {
    updateShadow()

    const unsubscribe = navigating.subscribe((navigating) => {
      if (navigating) {
        open = false
      }
    })

    // Return the cleanup function
    return () => {
      unsubscribe()
    }
  })
  $: pathname = $page.url.pathname

  function updateShadow() {
    shadow = window.scrollY !== 0
  }
</script>

<svelte:window on:scroll={updateShadow} />
<nav
  class={cn(
    'px-4 md:px-6 lg:px-8 fixed left-0 top-0 z-40 flex h-20 w-full items-center justify-between border-b bg-white/70 backdrop-blur-md transition-all duration-300 gap-2 md:gap-4 lg:gap-6',
    shadow && !open ? 'shadow-b border-gray-200' : 'border-white',
  )}
  style="backdrop-filter: blur(12px);"
>
  {#await pages then pages}
    <Brand />
    {#if $user?.object?.emailVerified}
      <div
        class="hidden sm:flex flex-1 items-center justify-start lg:justify-center min-w-0 gap-0.5 md:gap-1 lg:gap-1.5 xl:gap-2 overflow-x-auto no-scrollbar py-1 px-2"
      >
        {#each pages as page}
          <a
            class={cn(
              'relative rounded-full px-1.5 py-1 text-[11px] md:px-2 md:py-1.5 md:text-xs lg:px-2.5 lg:py-2 lg:text-sm xl:px-4 xl:text-base font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-center leading-tight flex items-center justify-center min-h-[2.5rem] max-w-[120px] shrink-0',
              pathname === page.href
                ? 'bg-blue-100 text-blue-700 shadow-sm'
                : 'hover:bg-gray-100 hover:text-blue-600',
            )}
            href={page.href}
            aria-current={pathname === page.href ? 'page' : undefined}
            tabindex="0"
          >
            {page.name}
            {#if pathname === page.href}
              <span
                class="absolute left-2 right-2 -bottom-1 h-1 rounded-full bg-blue-400/70"
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
        class="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:hidden"
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        on:click={() => {
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
    class="fixed left-0 top-20 z-50 flex h-[calc(100vh-5rem)] w-screen flex-col gap-2 bg-white/90 backdrop-blur-md p-d sm:hidden animate-slideDown shadow-lg border-t border-gray-200"
    transition:fade={{
      easing: cubicInOut,
      duration: 200,
    }}
    style="backdrop-filter: blur(12px);"
  >
    {#if $user?.object?.emailVerified}
      {#each pages as page}
        <a
          class={cn(
            'rounded-full px-3 py-2 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
            pathname === page.href
              ? 'bg-blue-100 text-blue-700 shadow-sm'
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
