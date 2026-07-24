export type Lang = 'ar' | 'en'

const strings = {
  appName: { ar: 'نوتندا', en: 'Notanda' },
  meetings: { ar: 'الاجتماعات', en: 'Meetings' },
  newMeeting: { ar: 'تسجيل اجتماع', en: 'Record meeting' },
  meetingTitlePlaceholder: { ar: 'عنوان الاجتماع (اختياري)', en: 'Meeting title (optional)' },
  stopRecording: { ar: 'إنهاء الاجتماع', en: 'End meeting' },
  recording: { ar: 'جارٍ التسجيل', en: 'Recording' },
  transcribing: { ar: 'جارٍ التفريغ…', en: 'Transcribing…' },
  waitingForSpeech: { ar: 'بانتظار الكلام… سيظهر النص خلال دقيقة تقريبًا', en: 'Waiting for speech… text appears within about a minute' },
  me: { ar: 'أنت', en: 'You' },
  them: { ar: 'المتحدث', en: 'Speaker' },
  transcript: { ar: 'النص الكامل', en: 'Transcript' },
  summary: { ar: 'الملخص', en: 'Summary' },
  decisions: { ar: 'القرارات', en: 'Decisions' },
  actionItems: { ar: 'المهام', en: 'Action items' },
  noSummaryYet: { ar: 'الملخص قيد الإعداد…', en: 'Summary in progress…' },
  summaryFailed: { ar: 'تعذّر إنشاء الملخص، النص الكامل متاح', en: 'Summary failed; transcript is available' },
  noMeetings: { ar: 'لا اجتماعات بعد. ابدأ أول تسجيل!', en: 'No meetings yet. Start your first recording!' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  serverUrl: { ar: 'رابط الخادم', en: 'Server URL' },
  apiKey: { ar: 'مفتاح API', en: 'API key' },
  microphone: { ar: 'الميكروفون', en: 'Microphone' },
  defaultMic: { ar: 'الافتراضي', en: 'Default' },
  language: { ar: 'لغة الواجهة', en: 'Interface language' },
  meetingLanguage: { ar: 'لغة الاجتماع', en: 'Meeting language' },
  arabic: { ar: 'العربية', en: 'Arabic' },
  english: { ar: 'الإنجليزية', en: 'English' },
  save: { ar: 'حفظ', en: 'Save' },
  saved: { ar: 'تم الحفظ', en: 'Saved' },
  back: { ar: 'رجوع', en: 'Back' },
  configureFirst: { ar: 'أدخل رابط الخادم ومفتاح API في الإعدادات أولًا', en: 'Set the server URL and API key in Settings first' },
  serverUnreachable: { ar: 'تعذّر الوصول إلى الخادم', en: 'Server unreachable' },
  uploadsPending: { ar: 'مقاطع بانتظار الرفع:', en: 'Chunks awaiting upload:' },
  statusRecording: { ar: 'تسجيل', en: 'recording' },
  statusProcessing: { ar: 'معالجة', en: 'processing' },
  statusComplete: { ar: 'مكتمل', en: 'complete' },
  statusError: { ar: 'خطأ', en: 'error' },
  captureFailed: { ar: 'تعذّر بدء التسجيل — تحقق من أذونات الميكروفون وتسجيل الشاشة', en: 'Could not start capture — check microphone and screen-recording permissions' }
} as const

export type StringKey = keyof typeof strings

export function makeT(lang: Lang) {
  return (key: StringKey): string => strings[key][lang]
}
