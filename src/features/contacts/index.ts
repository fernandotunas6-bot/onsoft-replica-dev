// Contact Verification & Communication Preferences
export {
  ContactVerificationService,
  type ContactChannel,
  type ContactVerificationProfile,
  type CommunicationPreferences,
} from "./contact-verification-service";

export {
  getContactVerificationProfileFn,
  getCommunicationPreferencesFn,
  setPreferredCommunicationChannelFn,
  updateCommunicationPreferencesFn,
  updateCommunicationPreferencesSchema,
  type UpdateCommunicationPreferencesInput,
} from "./contact-verification-server";
