<script setup lang="ts">
import { computed } from 'vue';
import { adapter } from '../lib/chains';
import type { MirrorStatus } from '../lib/chains';
/** Round chain marker. `status` undefined = "exists here" (used for comments, which are only listed from chains that have them). */
const props = defineProps<{ chain: string; status?: MirrorStatus; title?: string; href?: string }>();
const a = computed(() => adapter(props.chain));
const cls = computed(() => ({ off: props.status === 'missing', err: props.status === 'error', load: props.status === 'loading' }));
</script>
<template>
  <component :is="href ? 'a' : 'span'" class="cdot" :class="cls" :style="{ '--c': a.color }" :title="title ?? a.name"
    :href="href || undefined" :target="href ? '_blank' : undefined" :rel="href ? 'noopener noreferrer' : undefined">{{ status === 'error' ? '!' : a.letter }}</component>
</template>
