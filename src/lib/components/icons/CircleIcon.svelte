<script lang="ts">
  interface Props {
    [key: string]: any
  }

  let props: Props = $props()
</script>

<!--
  An empty outlined circle, sized to sit beside Heroicons' 24px outline set -
  Heroicons has no plain circle. Everything else here comes from
  @steeze-ui/heroicons; reach for that first.
-->
<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width="1.5"
  stroke="currentColor"
  aria-hidden="true"
  {...props}
>
  <circle cx="12" cy="12" r="9" />
</svg>
