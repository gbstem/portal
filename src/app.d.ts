// See https://kit.svelte.dev/docs/types#app

// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string
      code?: string
      details?: string
    }
    interface Locals {
      user: Data.User.Peek | null
    }
    // interface PageData {}
    // interface Platform {}
  }
}

declare module 'svelte/elements' {
  interface HTMLAttributes<T> {
    onoutclick?: (event: CustomEvent<any>) => void
  }
}

export {}
