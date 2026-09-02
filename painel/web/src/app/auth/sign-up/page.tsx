import { SignupForm1 } from "./components/signup-form-1"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <SignupForm1 />
    </MarketingFormPage>
  )
}
