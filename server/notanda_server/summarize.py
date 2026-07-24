"""Post-meeting summary via Claude Haiku. Costs ~$0.02 per hour-long meeting."""

import json

import anthropic

from . import settings

SYSTEM = """\
أنت مساعد يلخّص اجتماعات العمل. ستستلم نص اجتماع مفرّغًا آليًا (قد يحتوي أخطاء تفريغ \
وخلطًا بين العربية والإنجليزية). أخرج ملخصًا بالعربية الفصحى (مع إبقاء المصطلحات \
الإنجليزية كما هي)، وإن كان الاجتماع كله بالإنجليزية فلخّص بالإنجليزية.

أجب بكائن JSON فقط — بلا أي نص قبله أو بعده وبلا أسوار كود — بهذا الشكل:
{"overview_md": "فقرة أو فقرتان ملخّص عام بصيغة Markdown",
 "decisions": ["قرار ..."],
 "action_items": [{"text": "مهمة ...", "owner": "اسم صاحبها أو null"}]}

إن لم توجد قرارات أو مهام فأرجع قوائم فارغة. لا تخترع ما لم يُقل.\
"""


def summarize(transcript: str, language: str) -> dict:
    """Transcript ('[MM:SS] speaker: text' lines) -> summary dict.

    Raises on API failure or unparseable output; the worker owns retries.
    """
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=settings.SUMMARY_MODEL,
        max_tokens=2000,
        system=SYSTEM,
        messages=[{"role": "user", "content": f"لغة الاجتماع: {language}\n\n{transcript}"}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):  # tolerate a fenced reply despite instructions
        raw = raw.strip("`").removeprefix("json").strip()
    data = json.loads(raw)
    return {
        "overview_md": str(data.get("overview_md", "")),
        "decisions": [str(d) for d in data.get("decisions", [])],
        "action_items": [
            {"text": str(a.get("text", "")), "owner": a.get("owner")}
            for a in data.get("action_items", [])
            if isinstance(a, dict)
        ],
    }


def format_transcript(segments: list) -> str:
    """segments rows -> '[MM:SS] speaker: text' lines for the LLM."""
    lines = []
    for seg in segments:
        total_s = seg["start_ms"] // 1000
        stamp = f"[{total_s // 60:02d}:{total_s % 60:02d}]"
        speaker = "أنت" if seg["speaker"] == "me" else "المتحدث"
        lines.append(f"{stamp} {speaker}: {seg['text']}")
    return "\n".join(lines)
