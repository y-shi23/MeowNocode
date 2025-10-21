import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// --- Deletion tombstones helpers ---
const TOMBSTONE_KEY = 'deletedMemoIds'

export function addDeletedMemoTombstone(id) {
  try {
    if (id == null) return
    const raw = localStorage.getItem(TOMBSTONE_KEY)
    const list = raw ? JSON.parse(raw) : []
    const now = new Date().toISOString()
    const exists = Array.isArray(list) ? list.find((t) => t && t.id === id) : null
    if (exists) {
      exists.deletedAt = now
    } else {
      list.push({ id, deletedAt: now })
    }
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(list))
    // also broadcast change
    try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'memo.delete', id } })) } catch {}
  } catch {}
}

export function getDeletedMemoTombstones() {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function removeDeletedMemoTombstones(ids) {
  try {
    if (!ids || !ids.length) return
    const set = new Set(ids)
    const list = getDeletedMemoTombstones()
    const next = list.filter((t) => !set.has(t.id))
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(next))
  } catch {}
}

export function clearAllDeletedMemoTombstones() {
  try { localStorage.removeItem(TOMBSTONE_KEY) } catch {}
}

export function setDeletedMemoTombstones(list) {
  try {
    const payload = Array.isArray(list) ? list : []
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(payload))
  } catch {}
}
