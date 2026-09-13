'use client';

import type { Half } from '@/lib/rubric';

/** What a judge's phone keeps for one sheet: raw typed text, and which boxes have not reached the server yet. */
export interface Draft {
  raw: Record<string, string>;
  dirty: string[];
  errors?: number;
  savedAt: number;
}

const key = (judgeId: string, groupId: string, half: Half) => `tambiz:v1:${judgeId}:${groupId}:${half}`;

export function readDraft(judgeId: string, groupId: string, half: Half): Draft | null {
  try {
    const s = localStorage.getItem(key(judgeId, groupId, half));
    return s ? (JSON.parse(s) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(judgeId: string, groupId: string, half: Half, d: Draft) {
  try {
    if (!d.dirty.length && !d.errors) localStorage.removeItem(key(judgeId, groupId, half));
    else localStorage.setItem(key(judgeId, groupId, half), JSON.stringify(d));
  } catch {}
}
