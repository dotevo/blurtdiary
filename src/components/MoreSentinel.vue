<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '../lib/i18n';

/** Infinite scroll: an invisible marker below the list. When it comes near the viewport (or stays in it after a load) the next page is requested. */
const props = defineProps<{ can: boolean; loading: boolean }>();
const emit = defineEmits<{ more: [] }>();
const noIO = typeof IntersectionObserver === 'undefined';
const el = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;
const watchIt = (): void => { if (!el.value) return; io?.disconnect(); io?.observe(el.value); }; // observing again reports the current state, so a marker that is still in view asks for the next page
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return;
  io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && props.can && !props.loading) emit('more'); }, { rootMargin: '600px 0px' });
  watchIt();
});
watch(() => [props.loading, props.can], () => { if (!props.loading && props.can) watchIt(); });
onBeforeUnmount(() => io?.disconnect());
</script>
<template>
  <div ref="el" class="more-sentinel center mute help">
    <template v-if="loading">{{ t('loading') }}</template>
    <button v-else-if="can && noIO" @click="emit('more')">{{ t('loadMore') }}</button>
  </div>
</template>
