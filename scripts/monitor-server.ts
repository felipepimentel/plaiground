import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';

// Configuração do monitor
const MONITOR_PORT = process.env.MONITOR_PORT ? parseInt(process.env.MONITOR_PORT) : 8090;
const LOG_DIR = path.join(process.cwd(), 'logs');

// HTML template para a página de monitoramento
const monitorTemplate = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Host Monitor</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .status-card {
            background-color: #fff;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            border-left: 5px solid #3498db;
        }
        .status-title {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-active {
            background-color: #2ecc71;
        }
        .status-inactive {
            background-color: #e74c3c;
        }
        .log-container {
            background-color: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            font-family: monospace;
            height: 400px;
            overflow-y: auto;
            margin-top: 20px;
        }
        .log-line {
            margin: 0;
            padding: 3px 0;
            border-bottom: 1px solid #34495e;
        }
        .log-info {
            color: #3498db;
        }
        .log-error {
            color: #e74c3c;
        }
        .log-warn {
            color: #f39c12;
        }
        .refresh-button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        }
        .refresh-button:hover {
            background-color: #2980b9;
        }
        #timestamp {
            font-size: 14px;
            color: #7f8c8d;
            text-align: right;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>MCP Host Monitor</h1>
        <p id="timestamp">Última atualização: <span id="last-update"></span></p>
        
        <button class="refresh-button" onclick="window.location.reload()">Atualizar</button>
        
        <h2>Status do Servidor</h2>
        <div class="status-card">
            <div class="status-title">
                <h3><span class="status-indicator status-active"></span> Host MCP</h3>
                <span id="host-uptime">Uptime: --:--:--</span>
            </div>
            <p>Versão: <span id="version">-</span></p>
            <p>Sessões Ativas: <span id="active-sessions">-</span></p>
            <p>Clientes Conectados: <span id="connected-clients">-</span></p>
        </div>
        
        <h2>Logs do Sistema</h2>
        <div class="log-container" id="logs">
            <!-- Logs serão inseridos aqui -->
        </div>
    </div>

    <script>
        // Atualiza o timestamp
        document.getElementById('last-update').textContent = new Date().toLocaleString();
        
        // Função para carregar os logs mais recentes
        async function loadLogs() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                const logsContainer = document.getElementById('logs');
                logsContainer.innerHTML = '';
                
                logs.forEach(log => {
                    const logLine = document.createElement('p');
                    logLine.className = 'log-line';
                    
                    if (log.includes('[ERROR]')) {
                        logLine.classList.add('log-error');
                    } else if (log.includes('[WARN]')) {
                        logLine.classList.add('log-warn');
                    } else if (log.includes('[INFO]')) {
                        logLine.classList.add('log-info');
                    }
                    
                    logLine.textContent = log;
                    logsContainer.appendChild(logLine);
                });
                
                // Scroll para o final para mostrar os logs mais recentes
                logsContainer.scrollTop = logsContainer.scrollHeight;
            } catch (error) {
                console.error('Erro ao carregar logs:', error);
            }
        }
        
        // Carrega os logs quando a página é carregada
        loadLogs();
        
        // Simula os dados do status (em produção, substituir por dados reais da API)
        document.getElementById('version').textContent = "0.1.0";
        document.getElementById('active-sessions').textContent = "1";
        document.getElementById('connected-clients').textContent = "0";
        document.getElementById('host-uptime').textContent = "Uptime: 00:10:30";
    </script>
</body>
</html>
`;

// Inicializa o app Express
const app = express();
const server = http.createServer(app);

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal para a página de monitoramento
app.get('/', (req, res) => {
    res.send(monitorTemplate);
});

// API para obter os logs mais recentes
app.get('/api/logs', (req, res) => {
    try {
        // Verifica se o diretório de logs existe
        if (!fs.existsSync(LOG_DIR)) {
            return res.json([]);
        }

        // Obtém os arquivos de log
        const logFiles = fs.readdirSync(LOG_DIR)
            .filter(file => file.startsWith('mcp-host-'))
            .sort()
            .reverse();

        if (logFiles.length === 0) {
            return res.json([]);
        }

        // Lê o arquivo de log mais recente
        const latestLogFile = path.join(LOG_DIR, logFiles[0]);
        const logContent = fs.readFileSync(latestLogFile, 'utf8');

        // Retorna as últimas 100 linhas (ou todas se houver menos)
        const lines = logContent.split('\n').filter(line => line.trim() !== '');
        const lastLines = lines.slice(-100);

        res.json(lastLines);
    } catch (error) {
        console.error('Erro ao ler logs:', error);
        res.status(500).json({ error: 'Erro ao ler logs' });
    }
});

// API para obter o status do host (simulado)
app.get('/api/status', (req, res) => {
    // Em uma implementação real, buscar dados do host MCP
    const mockStatus = {
        version: '0.1.0',
        uptime: '00:10:30',
        activeSessions: 1,
        connectedClients: 0,
        isRunning: true
    };

    res.json(mockStatus);
});

// Inicia o servidor
server.listen(MONITOR_PORT, () => {
    console.log(`Monitor server running at http://localhost:${MONITOR_PORT}`);
}); 