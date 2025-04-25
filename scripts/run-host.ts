import { HostManager } from '../packages/mcp-host/src/host/host-manager';
import { HttpSseTransport } from '../packages/mcp-host/src/transport/http-sse-transport';
import { Session } from '../packages/mcp-host/src/session/session';
import fs from 'fs';
import path from 'path';

// Configuração do host
const HOST_CONFIG = {
    name: 'Plaiground MCP Host',
    version: '0.1.0',
    description: 'Model Context Protocol Host for Plaiground',
    defaultRequestTimeout: 60000, // 60 segundos
    autoGrantPermissions: true,
    logging: {
        connections: true,
        sessions: true,
        permissions: true,
        requests: true
    }
};

// Configuração do transporte
const TRANSPORT_CONFIG = {
    port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
    host: process.env.HOST || 'localhost',
    path: process.env.PATH || '/mcp'
};

// Configurações de log
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, `mcp-host-${new Date().toISOString().replace(/:/g, '-')}.log`);

// Garante que o diretório de logs existe
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Função para fazer log
function log(message: string, level: 'info' | 'error' | 'warn' = 'info') {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(formattedMessage);
    
    // Escreve no arquivo de log
    fs.appendFileSync(LOG_FILE, formattedMessage + '\n');
}

// Cria uma sessão automática para exemplo
async function createExampleSession(hostManager: HostManager): Promise<Session> {
    const sessionManager = hostManager.getSessionManager();
    const session = sessionManager.createSession({
        autoStart: true,
        maxClients: 10,
        metadata: {
            type: 'example',
            createdBy: 'system'
        }
    });
    
    log(`Sessão de exemplo criada com ID: ${session.id}`);
    return session;
}

async function main() {
    try {
        log('Iniciando MCP Host...');
        
        // Cria o host manager
        const hostManager = new HostManager(HOST_CONFIG);
        
        // Registra listeners para eventos
        hostManager.on('clientConnected', (client) => {
            log(`Cliente conectado: ${client.id} (${client.props.ip || 'unknown'})`);
        });
        
        hostManager.on('clientDisconnected', (client) => {
            log(`Cliente desconectado: ${client.id}`);
        });
        
        hostManager.on('sessionCreated', (session) => {
            log(`Sessão criada: ${session.id}`);
        });
        
        // Cria o transporte HTTP/SSE
        const transport = new HttpSseTransport(TRANSPORT_CONFIG);
        
        // Inicia o host
        hostManager.start();
        log('Host iniciado com sucesso');
        
        // Inicia o transporte
        await transport.start();
        log(`Transporte iniciado na URL: http://${TRANSPORT_CONFIG.host}:${TRANSPORT_CONFIG.port}${TRANSPORT_CONFIG.path}`);
        
        // Cria uma sessão de exemplo
        await createExampleSession(hostManager);
        
        // Mostra as informações do host
        const hostInfo = hostManager.getHostInfo();
        log(`Host Info: ${JSON.stringify(hostInfo)}`);
        
        // Mostra as capacidades do host
        const hostCapabilities = hostManager.getHostCapabilities();
        log(`Host Capabilities: ${JSON.stringify(hostCapabilities)}`);
        
        // Imprime informações de uso
        log(`MCP Host está executando em http://${TRANSPORT_CONFIG.host}:${TRANSPORT_CONFIG.port}${TRANSPORT_CONFIG.path}`);
        log('Pressione CTRL+C para desligar o servidor');
        
        // Tratamento de desligamento gracioso
        process.on('SIGINT', async () => {
            log('Desligando MCP Host...', 'info');
            
            try {
                // Para o transporte
                await transport.stop();
                log('Transporte parado com sucesso');
                
                // Para o host
                await hostManager.stop();
                log('Host parado com sucesso');
                
                log('Desligamento completo', 'info');
                process.exit(0);
            } catch (error) {
                log(`Erro durante o desligamento: ${error}`, 'error');
                process.exit(1);
            }
        });
    } catch (error) {
        log(`Falha ao iniciar MCP Host: ${error}`, 'error');
        process.exit(1);
    }
}

// Inicia a aplicação
main(); 