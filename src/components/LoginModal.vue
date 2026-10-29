<script setup lang="ts">
import { computed, ref } from 'vue';
import { auth, loginKey, loginWhaleVault } from '../lib/auth';
import { CHAINS, type ChainId } from '../lib/chains';
import { t } from '../lib/i18n';
import { accountOn } from '../lib/mirror';
import { toast } from '../lib/toast';
import ChainDot from './ChainDot.vue';
const emit = defineEmits<{ close: [] }>();
// Blurt is the primary chain and the default; every chain keeps its own, independent login.
const chain = ref<ChainId>(auth.me ? (CHAINS.find((c) => !auth.sessions[c.id])?.id ?? 'blurt') : 'blurt');
const locked = (id: ChainId): boolean => id !== 'blurt' && !auth.me; // other chains need a Blurt login first
const user = ref(''); const key = ref(''); const busy = ref(false); const remember = ref(false);
const clean = () => user.value.trim().toLowerCase().replace(/^@/, '');
const suggested = computed(() => accountOn(chain.value) ?? '');
const pick = (id: ChainId): void => { chain.value = id; user.value = ''; key.value = ''; };
async function run(fn: () => Promise<void>): Promise<void> {
  if (!clean()) { toast(t('enterUsername')); return; }
  busy.value = true;
  try { await fn(); emit('close'); } catch (e) { toast((e as Error).message || t('loginError')); }
  busy.value = false;
}
</script>
<template>
  <div class="modal" @click.self="emit('close')">
    <div>
      <b>{{ t('loginTitle') }}</b>
      <div class="login-chains" role="tablist">
        <button v-for="c in CHAINS" :key="c.id" :class="{ pri: chain === c.id, locked: locked(c.id) }" :disabled="locked(c.id)" :title="locked(c.id) ? t('blurtFirst') : c.name" @click="pick(c.id)">
          <ChainDot :chain="c.id" />{{ c.name }}<span v-if="auth.sessions[c.id]"> ✓</span>
        </button>
      </div>
      <div v-if="!auth.me" class="mute help">{{ t('blurtFirst') }}</div>
      <div v-else-if="chain !== 'blurt'" class="mute help">{{ t('loginOtherChain') }}</div>
      <input v-model="user" :placeholder="suggested || t('usernamePh')" autocapitalize="off">
      <button class="pri" :disabled="busy" @click="run(() => loginWhaleVault(chain, clean(), remember))">WhaleVault</button>
      <input v-model="key" type="password" :placeholder="t('keyPh')" autocomplete="off">
      <button :disabled="busy || !key" @click="run(() => loginKey(chain, clean(), key.trim(), remember))">{{ t('loginKey') }}</button>
      <span class="mute">{{ remember ? t('keyNoteSaved') : t('keyNote') }}</span>
      <label class="remember"><input v-model="remember" type="checkbox"> {{ t('rememberLogin') }}</label>
      <div v-if="remember" class="mute help badtxt">{{ t('rememberWarn') }}</div>
      <button @click="emit('close')">{{ t('cancel') }}</button>
    </div>
  </div>
</template>
