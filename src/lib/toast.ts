import { ref } from 'vue';
export const toastMsg = ref('');
let t: ReturnType<typeof setTimeout>;
export const toast = (m: string): void => { toastMsg.value = m; clearTimeout(t); t = setTimeout(() => { toastMsg.value = ''; }, 3500); };
