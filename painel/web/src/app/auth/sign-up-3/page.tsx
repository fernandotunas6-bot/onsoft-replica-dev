import { SignupForm3 } from "./components/signup-form-3"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <SignupForm3 />
    </MarketingFormPage>
  )
}
