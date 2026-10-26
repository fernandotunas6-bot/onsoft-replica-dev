# Publicar a app SIGA Plus para Android

A app Android é este estudo (`estudo/yft-school-system`) construído no **modo SIGA**
(contas e dados reais do SIGA, ver [MIGRACAO_SUPABASE.md](./MIGRACAO_SUPABASE.md)).
Descarrega-se em **portal-siga.com/download**, fora da Play Store.

## Estado (26/10/2026)

| O quê | Onde / valor |
| ----- | ------------ |
| Versão publicada | **1.0.0** na release [`android`](https://github.com/fernandotunas6-bot/onsoft-replica-dev/releases/tag/android) (nunca a «latest»: essa é do SIGA Desktop) |
| Ficheiros | `SIGA-Plus-Android-arm64.apk` (a maioria dos telemóveis), `SIGA-Plus-Android-armv7.apk` (32 bits), `SHA256SUMS-android.txt` |
| Pacote | `ao.onsoft.sigaplus` (não pode mudar: o Android trataria outro como outra app) |
| Servidor | `https://siga-yft.valentinocanguele.workers.dev` (Worker do estudo no modo SIGA) |
| Entrada | e-mail, B.I. ou n.º de aluno (com o endereço da escola) — rota `/api/mobile/login` do portal |

## Assinatura

Todos os APK são assinados com a mesma chave de upload. Sem ela, uma versão nova
não instala por cima da anterior (o Android exige a mesma assinatura).

| O quê | Onde |
| ----- | ---- |
| Certificado (SHA-256), público | `B3:40:33:FF:64:86:DC:0C:A0:44:9E:8D:15:CE:71:1F:08:A0:0E:34:D8:50:8C:0C:8E:54:D9:96:30:02:EF:57` |
| Chave (PKCS12, alias `siga-plus`) | segredo `ANDROID_KEYSTORE_BASE64` (o `.jks` em base64), ao nível do repositório |
| Palavra-passe (a mesma no ficheiro e na chave) | segredo `ANDROID_KEYSTORE_PASSWORD` |
| Cópias | `~/.android-siga/siga-plus-upload.jks` e `siga-plus-upload.password` (`chmod 600`) no computador do dono, e o cofre de senhas do dono |

A chave e a palavra-passe **nunca entram no repositório**. O certificado aparece no
site, nas notas da release e no workflow, que **recusa publicar** um APK assinado
com outro (`scripts/apk-certificado.py --esperado`).

Confirmar um APK descarregado (sem ferramentas Android):

```sh
python3 scripts/apk-certificado.py SIGA-Plus-Android-arm64.apk
```

**Se a chave se perder:** gerar outra (`keytool -genkeypair -storetype PKCS12 -alias
siga-plus …`), gravar os dois segredos, mudar o certificado em
`painel/web/src/lib/android-downloads.ts` e no workflow (o teste
`tests/tauri/android-downloads.test.ts` obriga a que sejam iguais), e avisar as escolas:
têm de desinstalar a app e instalar a nova. **Se for exposta:** o mesmo, de imediato.

## Publicar uma versão

1. Actions → **Estudo — YFT (APK Android)** → Run workflow, no `main`:
   `versao` = `X.Y.Z` (maior que a anterior), `publicar` = sim.
2. O workflow constrói no modo SIGA, corre `flutter analyze` e `flutter test`, confirma
   a assinatura, e substitui os ficheiros da release `android` (com `--latest=false`).
   O `versionCode` é o número da corrida do workflow, por isso sobe sempre.
3. O site oferece a versão nova sem mudar nada (os links apontam para a release
   `android`); a página mostra a versão e o tamanho lidos da API do GitHub.

Nos PR que mexem em `lib/`, `android/` ou `pubspec`, o mesmo workflow só constrói
(versão 0.0.0) e nunca publica.

## Servidor (Worker) no modo SIGA

Actions → **Estudo — Worker no modo SIGA (teste)** (`.github/workflows/estudo-yft-siga.yml`):
constrói a app web no modo SIGA, publica o Worker só em `workers.dev` (não toca em
`m.portal-siga.com`) e grava `SGA_SUPABASE_SECRET_KEY` a partir do
`SUPABASE_SERVICE_ROLE_KEY` do environment `production`. Primeira publicação: 26/10/2026,
versão `99e29002-bb02-47d3-b650-9bddb1ba8314`.

Verificar: `/health` → 200; `/api/sga/me` sem sessão → 401 `SESSION_REQUIRED`.

## Ainda por fazer

- Testar num telemóvel real (este Mac não corre o Flutter; a prova até aqui é o CI).
- Textos do aluno: entra pelos ecrãs do encarregado e vê «Educandos».
- Fase 5 da migração: desligar o Firebase e a base D1 do YFT (os dados de teste ficam).
- Play Store: exige conta de programador Google e a chave de upload acima.
