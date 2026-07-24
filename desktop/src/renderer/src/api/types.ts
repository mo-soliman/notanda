// Mirrors docs/API.md — update both together.

export type MeetingStatus = 'recording' | 'processing' | 'complete' | 'error'
export type Stream = 'mic' | 'sys'
export type Speaker = 'me' | 'them'
export type Language = 'ar' | 'en'

export interface MeetingListItem {
  id: string
  title: string | null
  status: MeetingStatus
  created_at: string
  duration_ms: number | null
  has_summary: boolean
}

export interface ActionItem {
  text: string
  owner: string | null
}

export interface Summary {
  overview_md: string
  decisions: string[]
  action_items: ActionItem[]
  generated_at: string
  model: string
}

export interface MeetingDetail {
  id: string
  title: string | null
  language: Language
  status: MeetingStatus
  created_at: string
  finished_at: string | null
  duration_ms: number | null
  summary: Summary | null
}

export interface Segment {
  seq: number
  speaker: Speaker
  start_ms: number
  end_ms: number
  text: string
}

export interface SegmentsResponse {
  segments: Segment[]
  last_seq: number
  pending_chunks: number
}
