<script setup lang="ts">
import { LANGS, lang, loadLanguage, t, type Lang } from '../lib/i18n';
defineProps<{ compact?: boolean }>();
</script>
<template>
  <select class="sel" :class="{ compact }" :value="lang" :aria-label="t('language')" :title="t('language')" @change="loadLanguage(($event.target as HTMLSelectElement).value as Lang)">
    <option v-for="l in LANGS" :key="l.code" :value="l.code">{{ compact ? l.code.toUpperCase() : l.label }}</option>
  </select>
</template>
