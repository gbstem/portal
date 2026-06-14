<script lang="ts">
  import Disclosure from '$lib/components/Disclosure.svelte'
  import Link from '$lib/components/Link.svelte'
  import PageLayout from '$lib/components/PageLayout.svelte'
  import { format } from 'date-fns'
</script>

<svelte:head>
  <title>FAQ</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="title">FAQ</svelte:fragment>
  <div class="w-full max-w-2xl space-y-4">
    <Disclosure>
      <svelte:fragment slot="title">
        I've verified my email but my application doesn't save or submit!
      </svelte:fragment>
      <svelte:fragment slot="content">
        Please store your application responses in a separate document. Then,
        sign out and sign back in.
      </svelte:fragment>
    </Disclosure>
    <!-- <Disclosure>
      <svelte:fragment slot="title"
        >My school is not listed on the application.</svelte:fragment
      >
      <svelte:fragment slot="content"
        >Please email us at <Link
          href="mailto:contact@gbstem.org"
          target="_blank"
          rel="noopener">contact@gbstem.org</Link
        > with information about your school and possibly a link to your school's
        website.</svelte:fragment
      >
    </Disclosure> -->
    <Disclosure>
      <svelte:fragment slot="title">
        I keep encountering an error and can't submit!
      </svelte:fragment>
      <svelte:fragment slot="content">
        Please contact us immediately at <Link
          href="mailto:contact@gbstem.org"
          target="_blank"
          rel="noopener">contact@gbstem.org</Link
        >
        with the following content.
        <ol class="list-inside list-disc">
          <li>
            Title should be "[Bug] Portal @ {format(new Date(), 'yyyy.MM.dd')}."
          </li>
          <li>
            In the body of the email, please include your email and id, which
            can both be found on your <a href="/profile">profile</a>. Then,
            describe your issue as best as you can; screenshots of the issue as
            well as a copy of your console found in your browser's developer
            tools is extremely helpful.
          </li>
        </ol>
      </svelte:fragment>
    </Disclosure>
  </div>
</PageLayout>
