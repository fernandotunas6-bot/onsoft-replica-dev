import { SignupForm2 } from "./components/signup-form-2"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <SignupForm2 />
    </MarketingFormPage>
  )
}
