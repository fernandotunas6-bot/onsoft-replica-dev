import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md">
            <Logo size={24} />
          </div>
          SIGA Plus
        </Link>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Criar uma escola</CardTitle>
            <CardDescription>
              O cadastro de novas escolas é feito no portal comercial. Esta consola é reservada aos
              administradores da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild>
              <a href={getCreateSchoolUrl()}>Abrir cadastro de escola</a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sign-in">Já sou administrador</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
