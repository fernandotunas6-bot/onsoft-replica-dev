import { ForgotPasswordForm2 } from "./components/forgot-password-form-2"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <ForgotPasswordForm2 />
    </MarketingFormPage>
  )
}
