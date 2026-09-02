import { LoginForm1 } from "./components/login-form-1"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function Page() {
  return (
    <MarketingFormPage showFooter={false}>
      <LoginForm1 />
    </MarketingFormPage>
  )
}
