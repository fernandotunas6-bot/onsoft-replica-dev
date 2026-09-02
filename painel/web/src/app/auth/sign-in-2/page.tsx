import { LoginForm2 } from "./components/login-form-2"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"

export default function LoginPage() {
  return (
    <MarketingFormPage showFooter={false}>
      <LoginForm2 />
    </MarketingFormPage>
  )
}
