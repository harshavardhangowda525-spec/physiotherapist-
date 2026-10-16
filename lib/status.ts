export const STATUSES = [
  "new",
  "awaiting_clinic_review",
  "awaiting_patient_response",
  "confirmed",
  "reschedule_requested",
  "cancelled",
  "completed",
] as const;
export type EnquiryStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New Enquiry",
  awaiting_clinic_review: "Awaiting Clinic Review",
  awaiting_patient_response: "Awaiting Patient Response",
  confirmed: "Confirmed",
  reschedule_requested: "Reschedule Requested",
  cancelled: "Cancelled",
  completed: "Completed",
};

/** What a patient is told about each status. Only "confirmed" may say confirmed. */
export const PATIENT_STATUS_TEXT: Record<EnquiryStatus, string> = {
  new: "received and waiting for the clinic team to review it. It is not yet a confirmed appointment.",
  awaiting_clinic_review: "with the clinic team for review. It is not yet a confirmed appointment.",
  awaiting_patient_response: "waiting for a reply from you. The clinic team has tried to contact you — please call 077158 77047.",
  confirmed: "confirmed by the clinic team.",
  reschedule_requested: "marked for rescheduling. The clinic team will contact you to agree a new time. It is not yet confirmed.",
  cancelled: "cancelled.",
  completed: "marked as completed.",
};

export const THERAPIST_PREF_LABELS = {
  female: "Female therapist preferred",
  male: "Male therapist preferred",
  no_preference: "No preference",
} as const;
export type TherapistPreference = keyof typeof THERAPIST_PREF_LABELS;
