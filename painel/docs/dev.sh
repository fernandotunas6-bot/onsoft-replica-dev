#!/bin/bash

# Servidor de Desenvolvimento da Documentação SIGA Plus
# Este script inicia o servidor de desenvolvimento VitePress para o sistema SIGA Plus

echo "🚀 Iniciando o Servidor de Documentação do SIGA Plus..."
echo ""

# Verificar se estamos no diretório docs
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Este script deve ser executado a partir do diretório docs/"
    echo "   Por favor execute: cd docs && ./dev.sh"
    exit 1
fi

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
    echo ""
fi

echo "🔧 Iniciando servidor VitePress..."
echo "📚 Documentação disponível em: http://localhost:5173"
echo ""
echo "Pressione Ctrl+C para parar o servidor"
echo ""

# Iniciar servidor de desenvolvimento seguro (escuta local)
npm run dev -- --host 127.0.0.1

