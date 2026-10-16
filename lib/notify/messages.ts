import { STATUS_LABELS, THERAPIST_PREF_LABELS, type EnquiryStatus, type TherapistPreference } from "../status";

export type EnquirySummary = {
  reference: string;
  patient_name: string;
  contact_number: string;
  preferred_date: string;
  preferred_time: string;
  locality: string;
  service_requirement: string;
  therapist_preference: TherapistPreference;
  status: EnquiryStatus;
  urgent_flag?: boolean;
};

/** Patient-provided reason, shortened so notifications don't carry unnecessary medical detail. */
export function shortReason(text: string, max = 160): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

export function staffNewEnquiryText(e: EnquirySummary): string {
  return [
    "NEW HOME PHYSIOTHERAPY ENQUIRY",
    `Reference: ${e.reference}`,
    `Patient: ${e.patient_name}`,
    `Phone: ${e.contact_number}`,
    `Preferred date: ${e.preferred_date}`,
    `Preferred time: ${e.preferred_time}`,
    `Locality: ${e.locality}`,
    `Reason: ${shortReason(e.service_requirement)}`,
    `Therapist preference: ${THERAPIST_PREF_LABELS[e.therapist_preference]}`,
    `Status: ${STATUS_LABELS.awaiting_clinic_review}`,
    ...(e.urgent_flag ? ["Note: the patient's message mentioned possibly urgent symptoms; they were advised to seek urgent care."] : []),
    "Please verify availability and contact the patient.",
  ].join("\n");
}

export function staffPatientUpdateText(reference: string, request: "cancel" | "reschedule", detail?: string): string {
  return [
    request === "cancel" ? "PATIENT CANCELLED APPOINTMENT REQUEST" : "PATIENT REQUESTED RESCHEDULE",
    `Reference: ${reference}`,
    ...(detail ? [`Patient note: ${shortReason(detail)}`] : []),
    "Please review in the staff dashboard.",
  ].join("\n");
}
