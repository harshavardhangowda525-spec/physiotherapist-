import { BUSINESS, UNKNOWN_FALLBACK } from "./business";

export type FaqKey =
  | "home_visits" | "how_to_request" | "contact" | "location" | "hours" | "areas"
  | "services" | "prices" | "female_therapist" | "change_cancel" | "website" | "reviews";

export const FAQ_ANSWERS: Record<FaqKey, string> = {
  home_visits: `Yes — ${BUSINESS.name} provides physiotherapy treatment at home. Every home visit has to be arranged and confirmed by the clinic team. I can submit an appointment request for you.`,
  how_to_request:
    "Choose \"Request a home physiotherapy appointment\" and I'll ask for your name, mobile number, preferred date and time, your area in Bengaluru, a short description of why you'd like physiotherapy, and your consent to share these details with the clinic. You'll get a reference number. It is a request — the clinic team will call you to confirm availability.",
  contact: `You can call the clinic on ${BUSINESS.phoneDisplay}.`,
  location: `The clinic's address is: ${BUSINESS.address}.`,
  hours: `The clinic's business listing shows "${BUSINESS.listedHours}". Home-visit slots depend on therapist availability, so the clinic team will confirm a time with you.`,
  areas: UNKNOWN_FALLBACK,
  services: `${BUSINESS.name} offers physiotherapy at home. For details of specific treatments or rehabilitation programmes: ${UNKNOWN_FALLBACK}`,
  prices: UNKNOWN_FALLBACK,
  female_therapist:
    "You can tell us if you prefer a female or male physiotherapist when you submit your request. The clinic team will let you know whether they can arrange it — it isn't guaranteed until they confirm.",
  change_cancel: `Yes. Choose "Check appointment-request status" and enter your reference number and mobile number, then you can ask to reschedule or cancel. You can also call the clinic on ${BUSINESS.phoneDisplay}.`,
  website: `The clinic's website is ${BUSINESS.website}.`,
  reviews: `The clinic's Google listing shows ${BUSINESS.googleRating}.`,
};

const RULES: [FaqKey, RegExp][] = [
  ["prices", /price|cost|charge|fee|rate|how much|₹|rs\.?\s?\d|rupee|pay(ment)?|package|insurance/],
  ["areas", /area|cover|locality|locations? (do|you)|come to|serve|visit (my|in)|near me|which places|whitefield|koramangala|indiranagar|hsr|btm|electronic city|jp nagar|banashankari|basavanagudi|malleshwaram|rajajinagar|hebbal|yelahanka|marathahalli|bellandur|sarjapur/],
  ["female_therapist", /female|lady|woman|women|male (physio|therapist)|gender/],
  ["change_cancel", /cancel|reschedul|change (my|the)? ?(appointment|request|booking|date|time)|postpone/],
  ["hours", /hour|open|timing|close|24|what time|when are you/],
  ["location", /where|address|located|location|direction|map|clinic (is|located)/],
  ["contact", /phone|number|call|contact|mobile|reach you/],
  ["how_to_request", /how (can|do|to) (i )?(book|request|get|make)|book(ing)?|appointment process/],
  ["home_visits", /at home|home (visit|physio|treatment)|come home|visit (me|home)/],
  ["services", /service|treat|therap|rehab|offer|provide|condition|stroke rehab|knee|back|neck|shoulder|sports/],
  ["website", /website|site|url/],
  ["reviews", /review|rating|stars/],
];

export function matchFaq(text: string): FaqKey | null {
  const t = text.toLowerCase();
  for (const [key, re] of RULES) if (re.test(t)) return key;
  return null;
}

export const FAQ_MENU: { key: FaqKey; label: string }[] = [
  { key: "home_visits", label: "Do you visit at home?" },
  { key: "areas", label: "Areas covered" },
  { key: "services", label: "Treatments" },
  { key: "prices", label: "Charges" },
  { key: "hours", label: "Opening hours" },
  { key: "location", label: "Clinic address" },
  { key: "female_therapist", label: "Female physiotherapist?" },
  { key: "change_cancel", label: "Change or cancel" },
];
