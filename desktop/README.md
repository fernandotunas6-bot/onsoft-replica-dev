# SIGA Desktop

Base completa do [Danny Smith Tauri Template](https://github.com/dannysmith/tauri-template), integrada no SIGA Plus. Origem e versão: `UPSTREAM.json`; licença original: `LICENSE.md`.

Na raiz do repositório:

```sh
npm run desktop:install
npm run desktop:dev
npm run desktop:quality
npm run desktop:build
```

Requer Node 24, Rust e pré-requisitos Tauri. Frontend local em `desktop/`, Rust em `../src-tauri/`. O portal escolar abre em janela própria e necessita Internet. Não existe uma segunda crate Tauri nesta pasta.

Inclui temas, português/inglês/francês/árabe, preferências persistentes, paleta de comandos, menus nativos, atalhos globais, quick pane e recuperação de dados. A instalação de actualizações ocorre no portal, com assinatura e protecção de gravações pendentes.

Documentação SIGA: `../docs/desktop/TAURI_RUNTIME.md`. Guias da arquitectura original: `docs/developer/README.md`.
