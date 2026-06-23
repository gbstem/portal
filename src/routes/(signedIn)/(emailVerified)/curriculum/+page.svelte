<script lang="ts">
  import Link from '$lib/components/Link.svelte'
  import PageLayout from '$lib/components/PageLayout.svelte'
  import Card from '$lib/components/Card.svelte'
  import Button from '$lib/components/Button.svelte'
  import Dialog from '$lib/components/Dialog.svelte'
  import { curriculums, tracks } from '$lib/components/helpers/curriculum'
  import type Curriculum from '$lib/components/types/Curriculum'

  let dialogEl: Dialog
  let selectedCurriculum: Curriculum = {
    class: '',
    url: '',
    track: '',
  }
</script>

<svelte:head>
  <title>Curriculum</title>
</svelte:head>
<PageLayout>
  <svelte:fragment slot="title"
    >{selectedCurriculum.class} Curriculum</svelte:fragment
  >
  <Dialog bind:this={dialogEl} size="full">
    <svelte:fragment slot="title"
      ><div class="flex items-center justify-between">
        <div>{selectedCurriculum.class} Curriculum</div>
        <div class="flex gap-4">
          <Button
            color="blue"
            on:click={() => window.open(selectedCurriculum.url, '_blank')}
            >View in Docs</Button
          ><Button color="red" on:click={dialogEl.close}>Close</Button>
        </div>
      </div></svelte:fragment
    >
    <Card slot="description">
      <iframe
        title={selectedCurriculum.class}
        src={selectedCurriculum.url + '?widget=true&rm=minimal'}
        width="100%"
        height="718"
        frameborder="10"
        marginheight="0"
        marginwidth="0">Loading…</iframe
      >
    </Card>
  </Dialog>
  <div class="w-full max-w-2xl space-y-4">
    {#each tracks as track}
      <Card>
        <h2 class="font-bold">{track}</h2>
        <div class="mb-4 inline-block">
          {#each curriculums.filter((curriculum) => curriculum.track === track) as curriculum}
            <div class="mt-2">
              <Button
                on:click={() => {
                  selectedCurriculum = curriculum
                  dialogEl.open()
                }}
                color="blue">View the {curriculum.class} Curriculum</Button
              >
            </div>
          {/each}
        </div>
      </Card>
    {/each}
  </div>
</PageLayout>
