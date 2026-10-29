<script setup lang="ts">
import { ref } from 'vue';
defineProps<{ name: string; small?: boolean }>();
const broken = ref(false);
</script>
<template>
  <span v-if="broken" class="avatar" :class="{ sm: small }">{{ (name[0] || '?').toUpperCase() }}</span>
  <img v-else class="avatar" :class="{ sm: small }" :src="`https://images.blurt.blog/u/${name}/avatar/small`" alt="" loading="lazy" @error="broken = true">
</template>
