import { ref, type Ref } from 'vue';
import { toast } from './toast';
import { t } from './i18n';
import { uploadEverywhere, type ImageMap } from './upload';

/**
 * Image upload for a plain textarea (comments and replies): file picker, pasted screenshots and dropped files are uploaded to the image hosts
 * and put in as `![image](url)` at the cursor. `images` remembers the copy per chain so a mirrored comment can point to each chain's own copy.
 */
export function useImageField(text: Ref<string>, ta: Ref<HTMLTextAreaElement | null>) {
  const uploading = ref(false);
  const images = ref<ImageMap>({});
  async function upload(f: File): Promise<void> {
    if (uploading.value || !f.type.startsWith('image/')) return;
    uploading.value = true;
    try {
      const { url, others, failed } = await uploadEverywhere(f);
      images.value[url] = others;
      if (failed.length) toast(t('uploadPartial', { fail: failed.join(', ') }));
      const el = ta.value; const s = el?.selectionStart ?? text.value.length, e = el?.selectionEnd ?? text.value.length;
      const md = `${s > 0 && text.value[s - 1] !== '\n' ? '\n' : ''}![image](${url})\n`;
      text.value = text.value.slice(0, s) + md + text.value.slice(e);
    } catch (err) { toast((err as Error).message || t('uploadFailed')); }
    uploading.value = false;
  }
  const named = (f: File): File => (f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type }));
  return {
    uploading, images,
    onPick(e: Event): void { const i = e.target as HTMLInputElement; const f = i.files?.[0]; i.value = ''; if (f) void upload(f); },
    onPaste(e: ClipboardEvent): void {
      const f = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
      if (f) { e.preventDefault(); void upload(named(f)); }
    },
    onDrop(e: DragEvent): void {
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); void upload(f); }
    },
  };
}
