import { ForgotPasswordForm1 } from "./components/forgot-password-form-1"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <ForgotPasswordForm1 />
    </MarketingFormPage>
  )
}
