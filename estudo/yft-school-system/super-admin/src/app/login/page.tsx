import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full slick-bg">
      <div className="mx-auto flex h-full min-h-screen w-full max-w-[1600px] overflow-hidden bg-white shadow-2xl lg:m-8 lg:rounded-[2.5rem]">
        <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-[#eef1f5] p-12 lg:flex">
          <div className="z-10">
            <h2 className="text-xl font-bold tracking-tighter text-[#1a2b3b]">
              XPAD
            </h2>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/login-splash.png"
              alt="Splash Design"
              className="max-h-[85%] max-w-[85%] object-contain"
            />
          </div>

          <div className="z-10" />
        </div>

        <div className="flex w-full items-center justify-center p-8 lg:w-[55%] lg:p-12">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
