# Plaiground - MCP Host

Plataforma de experimentação para o Model Context Protocol (MCP).

## O que é o MCP?

O MCP (Model Context Protocol) é um protocolo projetado para facilitar a comunicação entre aplicações cliente e servidores que hospedam modelos de IA. Ele padroniza a troca de mensagens, gerenciamento de recursos e execução de ferramentas entre clientes e servidores.

## Componentes do Sistema

O projeto é estruturado como um monorepo com os seguintes pacotes:

- **common**: Tipos, utilitários e definições de protocolo compartilhados
- **mcp-client**: Biblioteca cliente para conexão com hosts MCP
- **mcp-host**: Implementação de servidor host MCP
- **client**: Aplicação cliente de exemplo
- **server**: Implementação de servidor backend

## Características do Host MCP

O Host MCP implementa:

- Gerenciamento de sessões
- Gerenciamento de clientes
- Suporte a múltiplos tipos de transporte (HTTP/SSE, WebSocket)
- Sistema de permissões
- Execução de ferramentas

## Iniciando o Host

Para iniciar o host MCP:

```bash
# Instalar dependências
pnpm install

# Iniciar o host (com monitor web)
pnpm start

# Apenas o host
pnpm host

# Apenas o monitor
pnpm monitor
```

Por padrão, o host estará disponível em `http://localhost:8080/mcp` e o monitor em `http://localhost:8090`.

## Configuração

Você pode configurar o host usando variáveis de ambiente:

- `PORT`: Porta para o servidor MCP (padrão: 8080)
- `HOST`: Host para o servidor MCP (padrão: localhost)
- `PATH`: Caminho para o servidor MCP (padrão: /mcp)
- `MONITOR_PORT`: Porta para o servidor de monitoramento (padrão: 8090)

## Estrutura do Código

```
packages/
  ├── common/                # Tipos e utilitários compartilhados
  ├── mcp-client/            # Cliente para conexão com servidores MCP
  │    ├── src/
  │    │    ├── client/      # Cliente de alto nível
  │    │    ├── connection/  # Gerenciamento de conexão
  │    │    ├── protocol/    # Implementação do protocolo
  │    │    └── utils/       # Utilitários
  │    └── ...
  ├── mcp-host/              # Implementação do servidor host MCP
  │    ├── src/
  │    │    ├── client-manager/  # Gerenciamento de clientes
  │    │    ├── host/            # Configuração e gerenciamento do host
  │    │    ├── session/         # Gerenciamento de sessões
  │    │    └── transport/       # Implementações de transporte
  │    └── ...
  └── ...
scripts/
  ├── run-host.ts            # Script para executar o host
  └── monitor-server.ts      # Servidor de monitoramento web
```

## Sistema de Log

O host mantém logs detalhados na pasta `logs/` na raiz do projeto. Os logs incluem:

- Eventos de conexão
- Eventos de sessão
- Eventos de permissão
- Solicitações e respostas

## Monitoramento Web

O servidor de monitoramento web fornece:

- Visualização do status atual do host
- Exibição das sessões ativas
- Clientes conectados
- Logs em tempo real

Acesse o monitor em `http://localhost:8090`.

## Desenvolvimento

Para desenvolvimento:

```bash
# Executar em modo de desenvolvimento
pnpm dev-host

# Limpar arquivos gerados
pnpm clean

# Executar testes
pnpm test
```

## Contribuindo

1. Fork o repositório
2. Crie uma branch para a sua feature (`git checkout -b feature/amazing-feature`)
3. Commit suas mudanças (`git commit -m 'Add some amazing feature'`)
4. Push para a branch (`git push origin feature/amazing-feature`)
5. Abra um Pull Request
