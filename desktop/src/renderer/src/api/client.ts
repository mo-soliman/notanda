import type {
  Language,
  MeetingDetail,
  MeetingListItem,
  SegmentsResponse,
  Stream
} from './types'

let baseUrl = ''
let apiKey = ''

export function configure(url: string, key: string): void {
  baseUrl = url.replace(/\/+$/, '')
  apiKey = key
}

export function isConfigured(): boolean {
  return baseUrl !== '' && apiKey !== ''
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''))
  return res.status === 204 ? (undefined as T) : res.json()
}

export class ApiError extends Error {
  constructor(
    public status: number,
    detail: string
  ) {
    super(`API ${status}: ${detail}`)
  }
}

export const api = {
  createMeeting: (title: string | null, language: Language) =>
    request<{ id: string }>('POST', '/v1/meetings', { title, language }),

  uploadChunk: async (meetingId: string, stream: Stream, index: number, blob: Blob) => {
    const res = await fetch(`${baseUrl}/v1/meetings/${meetingId}/chunks/${stream}/${index}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'audio/webm' },
      body: blob
    })
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''))
  },

  finishMeeting: (meetingId: string, durationMs: number | null) =>
    request<{ status: string }>('POST', `/v1/meetings/${meetingId}/finish`, {
      duration_ms: durationMs
    }),

  listMeetings: () => request<{ meetings: MeetingListItem[] }>('GET', '/v1/meetings'),

  meetingDetail: (meetingId: string) => request<MeetingDetail>('GET', `/v1/meetings/${meetingId}`),

  segments: (meetingId: string, afterSeq: number) =>
    request<SegmentsResponse>('GET', `/v1/meetings/${meetingId}/segments?after_seq=${afterSeq}`)
}
