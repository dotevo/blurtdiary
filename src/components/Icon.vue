<script setup lang="ts">
/** One icon family (24px grid, 2px round strokes, currentColor) so the navigation looks the same everywhere instead of mixing emoji and glyphs. */
defineProps<{ name: 'feed' | 'tag' | 'home' | 'pen' | 'sliders' | 'bell' | 'gift' }>();
</script>
<template>
  <svg class="ico" viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'feed'"><path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z" /><path d="M18 9h2v9a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h3" /></template>
    <template v-else-if="name === 'tag'"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" /></template>
    <template v-else-if="name === 'home'"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></template>
    <template v-else-if="name === 'pen'"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></template>
    <template v-else-if="name === 'sliders'"><path d="M4 7h8M18 7h2M4 17h2M12 17h8" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></template>
    <template v-else-if="name === 'bell'"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z" /><path d="M10 21h4" /></template>
    <template v-else-if="name === 'gift'"><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M12 9v11M4 14h16M12 9C9 9 8 5 10.5 5S12 9 12 9zm0 0c3 0 4-4 1.5-4S12 9 12 9z" /></template>
  </svg>
</template>
