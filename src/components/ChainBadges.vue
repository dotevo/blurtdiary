<script setup lang="ts">
import { t } from '../lib/i18n';
import type { MirrorStatus } from '../lib/chains';
import ChainDot from './ChainDot.vue';

export interface BadgeItem { id: string; name: string; status: MirrorStatus; error?: string; account?: string; url?: string; canSend: boolean; sending: boolean }
/** Post-level row: where does this post exist? Found = coloured (links to the copy), missing = dashed, unknown (RPC error) = "!". */
defineProps<{ items: BadgeItem[] }>();
const emit = defineEmits<{ retry: [chain: string]; send: [chain: string] }>();
const label = (i: BadgeItem): string => ({
  loading: t('chainChecking', { c: i.name }),
  found: t('chainFound', { c: i.name, a: i.account ?? '' }),
  missing: t('chainMissing', { c: i.name }),
  error: t('chainError', { c: i.name }) + (i.error ? ` [${i.error}]` : ''),
}[i.status]);
</script>
<template>
  <div class="chains">
    <span class="mute">{{ t('alsoOn') }}</span>
    <span v-for="i in items" :key="i.id" class="chain-item">
      <ChainDot v-if="i.status === 'error'" :chain="i.id" status="error" :title="label(i)" role="button" @click="emit('retry', i.id)" />
      <ChainDot v-else :chain="i.id" :status="i.status === 'found' ? undefined : i.status" :title="label(i)" :href="i.status === 'found' ? i.url : undefined" />
      <span class="chain-name" :class="{ mute: i.status !== 'found' }">{{ i.name }}<template v-if="i.status === 'found' && i.account"> @{{ i.account }}</template><template v-else-if="i.status === 'missing'"> – {{ t('notThere') }}</template><template v-else-if="i.status === 'error'"> – ?</template><template v-else-if="i.status === 'loading'"> …</template></span>
      <button v-if="i.canSend" class="small" :disabled="i.sending" @click="emit('send', i.id)">{{ t('sendTo', { c: i.name }) }}</button>
    </span>
  </div>
</template>
