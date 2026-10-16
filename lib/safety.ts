// Medical-safety guards. The assistant is administrative only: it never
// diagnoses, prescribes or promises outcomes.

const URGENT_PATTERNS: RegExp[] = [
  /chest pain/, /heart attack/, /can'?t breathe|cannot breathe|difficulty breathing|breathless|short(ness)? of breath/,
  /unconscious|fainted|passed out|not responding/, /stroke|face (is )?droop|slurred speech/,
  /sudden (weakness|numbness|paralysis)|can'?t move (my )?(arm|leg|side)/,
  /heavy bleeding|bleeding (a lot|heavily|won'?t stop)/, /head injury|hit (my|his|her) head/,
  /(broken|fractured?) bone|bone (is )?(sticking|broken)|suspected fracture/,
  /lost control of (bladder|bowel)|loss of bladder|numb(ness)? (in|around) (groin|saddle)/,
  /severe|unbearable|excruciating/, /suicid|kill myself|self[- ]harm/, /seizure|convulsion/,
  /emergency|accident just|just fell and can'?t/,
];

const DIAGNOSIS_PATTERNS: RegExp[] = [
  /\bdiagnos/, /what('?s| is) wrong with/, /do i have\b/, /is it (a |an )?(fracture|slip disc|serious|arthritis|sciatica)/,
  /which (exercise|medicine|tablet|cream|painkiller)/, /what (exercise|medicine|tablet|painkiller)s? should/,
  /should i (take|apply|do|use)/, /how (long|soon) (will|until|before) .*(recover|heal|better)/,
  /will (it|i|physio|physiotherapy) (cure|heal|fix|recover)/, /\bcure\b/, /prescri/,
  /(home )?remed(y|ies)/, /what causes/, /is (this|it) normal/,
];

export function isUrgent(text: string): boolean {
  const t = text.toLowerCase();
  return URGENT_PATTERNS.some((p) => p.test(t));
}

export function isDiagnosisRequest(text: string): boolean {
  const t = text.toLowerCase();
  return DIAGNOSIS_PATTERNS.some((p) => p.test(t));
}

export const URGENT_REPLY =
  "What you've described may need urgent medical attention. Please don't wait for a home physiotherapy appointment — call 112 (or 108 for an ambulance) or go to the nearest hospital emergency department now. I'm an appointment assistant and can't assess medical problems.";

export const DIAGNOSIS_REPLY =
  "I'm the clinic's appointment assistant, so I can't diagnose conditions, suggest exercises or medicines, or predict recovery. A qualified physiotherapist or doctor can assess you properly. I can help you submit a home physiotherapy appointment request so the clinic team can contact you. If symptoms are severe or getting worse, please seek medical care promptly.";
