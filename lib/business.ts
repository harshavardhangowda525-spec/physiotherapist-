// Verified business facts supplied by the client. Do NOT add prices, therapist
// credentials, service areas, availability or medical claims here unless the
// clinic has confirmed them in writing.
export const BUSINESS = {
  name: "Physiotherapy Treatment at Home",
  category: "Physiotherapist / Home physiotherapy services",
  address:
    "9/100, Ground Floor, ATA Street, opposite Brigade MM A Block, near H.N. Fashion, Yediyur, Jayanagar 6th Block, Bengaluru, Karnataka 560082",
  phoneDisplay: "077158 77047",
  phoneTel: "+917715877047",
  website: "https://physiotherapytreatmentathome.com",
  listedHours: "Open 24 hours",
  googleRating: "5.0 stars from 49 Google reviews",
  womenOwned: true,
} as const;

export const UNKNOWN_FALLBACK =
  "I'd be happy to help you check that. The clinic team can confirm the latest details. Would you like me to submit an enquiry or share the clinic's contact number?";

export const REQUEST_NOT_BOOKING =
  "Thank you! Your appointment request has been submitted to the clinic. This is a request, not a confirmed booking. The clinic team will contact you to verify availability and confirm the appointment.";

export const CONSENT_TEXT =
  "I agree that the details I have shared may be stored and shared with the Physiotherapy Treatment at Home clinic team so they can contact me about this appointment request. My details will not be used for promotional messages.";

export const PRIVACY_NOTICE =
  "Your details are used only to process this appointment request. They are stored securely and shared only with the clinic team. You can ask the clinic to delete them at any time by calling " +
  "077158 77047.";
