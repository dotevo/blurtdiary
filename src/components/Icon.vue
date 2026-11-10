<script setup lang="ts">
/** One icon family (24px grid, 2px round strokes, currentColor) so the navigation looks the same everywhere instead of mixing emoji and glyphs. */
defineProps<{ name: 'feed' | 'tag' | 'home' | 'pen' | 'sliders' | 'bell' | 'gift' | 'chat' | 'heart' | 'heart-fill' | 'star' | 'star-fill' | 'x' | 'check' | 'plus' | 'refresh' | 'warn' | 'pin' | 'chart' | 'image' | 'download' | 'doc' | 'up' | 'down' | 'coin' | 'at' | 'repeat' | 'user-plus' }>();
</script>
<template>
  <svg class="ico" viewBox="0 0 24 24" width="1.25em" height="1.25em" :fill="name.endsWith('-fill') ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'feed'"><path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z" /><path d="M18 9h2v9a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h3" /></template>
    <template v-else-if="name === 'tag'"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" /></template>
    <template v-else-if="name === 'home'"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></template>
    <template v-else-if="name === 'pen'"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></template>
    <template v-else-if="name === 'sliders'"><path d="M4 7h8M18 7h2M4 17h2M12 17h8" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></template>
    <template v-else-if="name === 'bell'"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z" /><path d="M10 21h4" /></template>
    <template v-else-if="name === 'heart' || name === 'heart-fill'"><path d="M12 20s-7-4.4-9-9.2C1.8 7.5 3.6 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.2 0 5 3 3.8 6.3C19 15.6 12 20 12 20z" /></template>
    <template v-else-if="name === 'star' || name === 'star-fill'"><path d="m12 3.5 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.3 6.6 20.2l1.1-6.1-4.5-4.2 6.1-.8L12 3.5z" /></template>
    <template v-else-if="name === 'x'"><path d="M6 6l12 12M18 6 6 18" /></template>
    <template v-else-if="name === 'check'"><path d="m5 12.5 4.5 4.5L19 7.5" /></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'refresh'"><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5" /></template>
    <template v-else-if="name === 'warn'"><path d="M12 4 2.5 20h19L12 4z" /><path d="M12 10v4.5M12 17.5v.1" /></template>
    <template v-else-if="name === 'pin'"><path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" /></template>
    <template v-else-if="name === 'chart'"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></template>
    <template v-else-if="name === 'image'"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 3.5 3L15 13l5 4.5" /></template>
    <template v-else-if="name === 'download'"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" /></template>
    <template v-else-if="name === 'doc'"><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5v4h4M9.5 12h5M9.5 16h5" /></template>
    <template v-else-if="name === 'up'"><path d="m6 14 6-6 6 6" /></template>
    <template v-else-if="name === 'down'"><path d="m6 10 6 6 6-6" /></template>
    <template v-else-if="name === 'coin'"><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.2C14 8.5 13.2 8 12 8c-1.4 0-2.4.7-2.4 1.8 0 2.4 5 1.1 5 3.6 0 1.1-1.1 1.9-2.6 1.9-1.2 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5" /></template>
    <template v-else-if="name === 'at'"><circle cx="12" cy="12" r="3.5" /><path d="M15.5 12v1.3a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" /></template>
    <template v-else-if="name === 'repeat'"><path d="m17 3 3.5 3.5L17 10M3.5 11V9.5A3 3 0 0 1 6.5 6.5h14M7 21l-3.5-3.5L7 14M20.5 13v1.5a3 3 0 0 1-3 3h-14" /></template>
    <template v-else-if="name === 'user-plus'"><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M19 8v6M16 11h6" /></template>
    <template v-else-if="name === 'chat'"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></template>
    <template v-else-if="name === 'gift'"><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M12 9v11M4 14h16M12 9C9 9 8 5 10.5 5S12 9 12 9zm0 0c3 0 4-4 1.5-4S12 9 12 9z" /></template>
  </svg>
</template>
