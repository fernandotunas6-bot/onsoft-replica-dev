import { ForgotPasswordForm3 } from "./components/forgot-password-form-3"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <ForgotPasswordForm3 />
    </MarketingFormPage>
  )
}
