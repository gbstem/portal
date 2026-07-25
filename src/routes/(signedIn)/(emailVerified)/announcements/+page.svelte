<script lang="ts">
  import { getDocs, collection } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import { format } from 'date-fns'
  import { db } from '$lib/client/firebase'
  import PageLayout from '$lib/components/PageLayout.svelte'

  let announcements: Array<Data.Announcement<'client'>> = $state([])
  onMount(() => {
    getDocs(collection(db, 'announcements')).then((snapshot) => {
      announcements = snapshot.docs.map(
        (doc) => doc.data() as Data.Announcement<'client'>,
      )
    })
  })
</script>

<svelte:head>
  <title>Announcements</title>
</svelte:head>

<PageLayout cols={2}>
  {#snippet title()}
    Announcements
  {/snippet}
  {#each announcements as announcement}
    <div class="mb-4">
      <h3 class="text-lg font-semibold">{announcement.title}</h3>
      <p>{announcement.content}</p>
      <p class="mt-2 text-gray-500">
        {format(new Date(announcement.timestamp.seconds * 1000), 'yyyy.MM.dd')}
      </p>
    </div>
  {/each}
</PageLayout>
