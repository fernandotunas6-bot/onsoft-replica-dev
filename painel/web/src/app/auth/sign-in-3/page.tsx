import { LoginForm3 } from "./components/login-form-3"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function LoginPage() {
  return (
    <MarketingFormPage showFooter={false}>
      <LoginForm3 />
    </MarketingFormPage>
  )
}
