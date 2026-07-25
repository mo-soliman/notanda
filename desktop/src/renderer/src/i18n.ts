export type Lang = 'ar' | 'en'

const strings = {
  appName: { ar: 'نوتندا', en: 'Notanda' },
  tagline: { ar: 'ملاحظات اجتماعاتك، بالعربية', en: 'Meeting notes that speak Arabic' },
  meetings: { ar: 'الاجتماعات', en: 'Meetings' },
  newMeeting: { ar: 'ابدأ التسجيل', en: 'Start recording' },
  meetingTitlePlaceholder: { ar: 'عنوان الاجتماع (اختياري)', en: 'Meeting title (optional)' },
  stopRecording: { ar: 'إنهاء الاجتماع', en: 'End meeting' },
  recording: { ar: 'جارٍ التسجيل', en: 'Recording' },
  finishing: { ar: 'جارٍ الإنهاء…', en: 'Finishing…' },
  starting: { ar: 'جارٍ التحضير…', en: 'Getting ready…' },
  transcribing: { ar: 'جارٍ التفريغ…', en: 'Transcribing…' },
  waitingForSpeech: {
    ar: 'بانتظار الكلام… يظهر النص بعد نحو دقيقة من بدء الحديث',
    en: 'Listening… text appears about a minute after people start talking'
  },
  me: { ar: 'أنت', en: 'You' },
  them: { ar: 'المتحدث', en: 'Speaker' },
  transcript: { ar: 'النص الكامل', en: 'Transcript' },
  summary: { ar: 'الملخص', en: 'Summary' },
  decisions: { ar: 'القرارات', en: 'Decisions' },
  actionItems: { ar: 'المهام', en: 'Action items' },
  noSummaryYet: { ar: 'الملخص قيد الإعداد…', en: 'Writing the summary…' },
  summaryFailed: {
    ar: 'تعذّر إنشاء الملخص، لكن النص الكامل متاح',
    en: "Summary failed, but the transcript is safe"
  },
  noMeetings: { ar: 'لا اجتماعات بعد. ابدأ أول تسجيل!', en: 'No meetings yet. Record your first one.' },
  noTranscript: { ar: 'لا يوجد نص لهذا الاجتماع', en: 'No transcript for this meeting' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  serverUrl: { ar: 'رابط الخادم', en: 'Server URL' },
  apiKey: { ar: 'مفتاح API', en: 'API key' },
  language: { ar: 'لغة الواجهة', en: 'Interface language' },
  meetingLanguage: { ar: 'لغة الاجتماعات', en: 'Meeting language' },
  meetingLanguageHint: {
    ar: 'اللغة التي يُتوقع التحدث بها في اجتماعاتك',
    en: 'The language you expect people to speak in your meetings'
  },
  arabic: { ar: 'العربية', en: 'Arabic' },
  english: { ar: 'الإنجليزية', en: 'English' },
  save: { ar: 'حفظ', en: 'Save' },
  saved: { ar: 'تم الحفظ ✓', en: 'Saved ✓' },
  back: { ar: 'رجوع', en: 'Back' },
  copy: { ar: 'نسخ', en: 'Copy' },
  copied: { ar: 'تم النسخ ✓', en: 'Copied ✓' },
  configureFirst: {
    ar: 'أدخل رابط الخادم ومفتاح API في الإعدادات للبدء',
    en: 'Add your server URL and API key in Settings to get started'
  },
  openSettings: { ar: 'فتح الإعدادات', en: 'Open Settings' },
  serverUnreachable: { ar: 'تعذّر الوصول إلى الخادم', en: "Can't reach the server" },
  uploadsPending: { ar: 'مقاطع بانتظار الرفع:', en: 'Chunks awaiting upload:' },
  statusRecording: { ar: 'تسجيل', en: 'Recording' },
  statusProcessing: { ar: 'معالجة', en: 'Processing' },
  statusComplete: { ar: 'مكتمل', en: 'Done' },
  statusError: { ar: 'خطأ', en: 'Error' },
  captureFailed: {
    ar: 'تعذّر بدء التسجيل — تحقق من أذونات الميكروفون وتسجيل الشاشة',
    en: 'Could not start recording — check microphone and screen-recording permissions'
  }
} as const

export type StringKey = keyof typeof strings

export function makeT(lang: Lang) {
  return (key: StringKey): string => strings[key][lang]
}
