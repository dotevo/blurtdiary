export interface Beneficiary { account: string; weight: number }
export interface Post {
  beneficiaries?: Beneficiary[]; category?: string; community_name?: string;
  author: string; permlink: string; title: string; body: string; created: string;
  json_metadata?: string | Record<string, unknown>;
  payout?: number | string; pending_payout_value?: string; total_payout_value?: string; curator_payout_value?: string;
  children?: number; net_votes?: number;
  stats?: { total_votes?: number };
  active_votes?: { voter: string; percent?: number; rshares?: number | string }[];
  url?: string; depth?: number; is_paidout?: boolean; author_payout_value?: string; root_permlink?: string; root_author?: string; parent_author?: string; parent_permlink?: string;
}
export interface BlogCategory { id: string; name: string; desc: string; tags: string[] }
export interface BlogLink { label: string; url: string }
/** Sidebar panel: a built-in one (`about`, `payouts`, `comments`, `categories`) or a custom one (id `custom` + title/text). The array order is the display order. */
export interface PanelCfg { id: string; title?: string; text?: string }
export interface BlogConfig {
  title?: string; subtitle?: string; about?: string; cover?: string; logo?: string; language?: string; footer?: string;
  palette?: string; accent?: string; accentDark?: string; bg?: string; bgDark?: string;
  font?: 'sans' | 'serif' | 'mono'; layout?: 'grid' | 'list'; sidebar?: 'right' | 'left' | 'none'; panels?: PanelCfg[];
  /** The blog owner's account names on the OTHER chains (chain id -> account). Blurt is always `?user=`. */
  accounts?: Record<string, string>;
  /** Extra look-and-feel options (see UI_OPTIONS in config.ts). Only values that differ from the default are stored. */
  ui?: Record<string, string>;
  links: BlogLink[]; cats: BlogCategory[];
}
export interface Profile { name?: string; about?: string; cover_image?: string; blog_config?: string; diary_config?: string }
/** A login on one chain. A visitor can be logged in on several chains at once (one session per chain). */
export interface Session { user: string; type: 'key' | 'wv'; key?: string; chain: string;
  /** Kept in localStorage (survives closing the tab) instead of only in this tab's sessionStorage. Opt-in at login. */
  remember?: boolean }
export type Operation = [string, Record<string, unknown>];
