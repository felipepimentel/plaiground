import { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpError, McpErrorCode } from '@plaiground/common';
import { EventSourcePolyfill, MessageEvent } from 'event-source-polyfill';
import fetch from 'isomorphic-unfetch';
import { McpAuthCredentials, McpTransport, McpTransportConfig, McpTransportEvent, McpTransportEventHandler } from './transport';

/**
 * Configuration for HTTP/SSE transport
 */
export interface HttpSseTransportConfig extends McpTransportConfig {
  /**
   * Base URL for the MCP server
   */
  baseUrl: string;

  /**
   * Reconnect timeout in milliseconds
   */
  reconnectTimeout?: number;
}

/**
 * Implementation of MCP transport using HTTP for requests and SSE for responses
 */
export class HttpSseTransport implements McpTransport {
  public readonly type = 'http-sse';
  private _isConnected = false;
  private eventSource: EventSourcePolyfill | null = null;
  private eventHandlers: McpTransportEventHandler[] = [];
  private readonly config: HttpSseTransportConfig;
  private authToken: string | null = null;

  constructor(config: HttpSseTransportConfig) {
    this.config = {
      reconnectTimeout: 3000,
      ...config,
    };
    
    // Apply initial auth if provided
    if (this.config.auth?.token) {
      this.authToken = this.config.auth.token;
    }
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    try {
      // Prepare headers for EventSource
      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        ...(this.config.headers || {}),
      };
      
      // Add auth token if available
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      // Create event source for SSE connection
      const eventSourceUrl = `${this.config.baseUrl}/events`;
      this.eventSource = new EventSourcePolyfill(eventSourceUrl, {
        headers,
        heartbeatTimeout: this.config.reconnectTimeout,
      });

      // Set up event handlers
      this.eventSource.onopen = () => {
        this._isConnected = true;
        this.emitEvent({ type: 'connected' });
      };

      this.eventSource.onerror = (err) => {
        // Check if this is an auth error (HTTP 401)
        if (err instanceof Error && err.message?.includes('401')) {
          this.emitEvent({ 
            type: 'auth_required', 
            authTypes: ['token', 'basic'] 
          });
          return;
        }
        
        const error = new McpError(
          McpErrorCode.InternalError,
          'SSE connection error',
          err
        );
        this.emitEvent({ type: 'error', error });

        // If we were connected, emit disconnected
        if (this._isConnected) {
          this._isConnected = false;
          this.emitEvent({ type: 'disconnected', reason: 'SSE connection error' });
        }
      };

      this.eventSource.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          // Handle responses and notifications
          if ('id' in data) {
            this.emitEvent({
              type: 'response',
              response: data as JsonRpcResponse,
            });
          } else if ('method' in data) {
            this.emitEvent({
              type: 'notification',
              notification: data as JsonRpcNotification,
            });
          }
        } catch (err) {
          const error = new McpError(
            McpErrorCode.ParseError,
            'Failed to parse SSE message',
            err
          );
          this.emitEvent({ type: 'error', error });
        }
      };

      // Listen for specific event types
      this.eventSource.addEventListener('notification', (event: MessageEvent) => {
        try {
          const notification = JSON.parse(event.data) as JsonRpcNotification;
          this.emitEvent({
            type: 'notification',
            notification,
          });
        } catch (err) {
          const error = new McpError(
            McpErrorCode.ParseError,
            'Failed to parse notification event',
            err
          );
          this.emitEvent({ type: 'error', error });
        }
      });

      this.eventSource.addEventListener('response', (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data) as JsonRpcResponse;
          this.emitEvent({
            type: 'response',
            response,
          });
        } catch (err) {
          const error = new McpError(
            McpErrorCode.ParseError,
            'Failed to parse response event',
            err
          );
          this.emitEvent({ type: 'error', error });
        }
      });
      
      // Listen for auth events
      this.eventSource.addEventListener('auth_required', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.emitEvent({
            type: 'auth_required',
            authTypes: data.authTypes || ['token', 'basic'],
          });
        } catch (err) {
          const error = new McpError(
            McpErrorCode.ParseError,
            'Failed to parse auth_required event',
            err
          );
          this.emitEvent({ type: 'error', error });
        }
      });

      // Wait for the connection to be established
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          if (this.eventSource) {
            this.eventSource.removeEventListener('open', onOpen);
            this.eventSource.removeEventListener('error', onError);
          }
          resolve();
        };

        const onError = (err: Event) => {
          if (this.eventSource) {
            this.eventSource.removeEventListener('open', onOpen);
            this.eventSource.removeEventListener('error', onError);
          }
          reject(new Error('Failed to connect to SSE: ' + err));
        };

        if (this.eventSource) {
          this.eventSource.addEventListener('open', onOpen);
          this.eventSource.addEventListener('error', onError as EventListener);
        }
      });
    } catch (err) {
      // Clean up any partial connection
      this.disconnect();
      throw new McpError(
        McpErrorCode.InternalError,
        'Failed to establish connection',
        err
      );
    }
  }

  public async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this._isConnected) {
      this._isConnected = false;
      this.emitEvent({ type: 'disconnected', reason: 'Disconnected by client' });
    }
  }

  public async sendRequest(request: JsonRpcRequest): Promise<void> {
    if (!this._isConnected) {
      throw new McpError(
        McpErrorCode.InternalError,
        'Cannot send request: not connected'
      );
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.headers || {}),
    };
    
    // Add auth token if available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/jsonrpc`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        // Check for authentication errors
        if (response.status === 401) {
          this.emitEvent({ 
            type: 'auth_required', 
            authTypes: ['token', 'basic']
          });
          throw new McpError(
            McpErrorCode.UnauthorizedError,
            'Authentication required'
          );
        }
        
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      // For HTTP transports, responses typically come through SSE
      // but some servers may respond directly to the HTTP request
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const responseData = await response.json();
        this.emitEvent({
          type: 'response',
          response: responseData as JsonRpcResponse,
        });
      }
    } catch (err) {
      throw new McpError(
        McpErrorCode.InternalError,
        'Failed to send request',
        err
      );
    }
  }
  
  public async authenticate(credentials: McpAuthCredentials): Promise<void> {
    try {
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(this.config.headers || {}),
      };
      
      // Handle different auth types
      if (credentials.type === 'token' && credentials.token) {
        this.authToken = credentials.token;
        headers['Authorization'] = `Bearer ${credentials.token}`;
      } else if (credentials.type === 'basic' && credentials.username && credentials.password) {
        const basicAuth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${basicAuth}`;
      } else if (credentials.type === 'apikey' && credentials.token) {
        headers['X-API-Key'] = credentials.token;
      }
      
      // Send authentication request
      const response = await fetch(`${this.config.baseUrl}/auth`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: credentials.type,
          params: credentials.params || {},
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        this.emitEvent({ 
          type: 'auth_failure',
          error: new McpError(
            McpErrorCode.AuthenticationFailed,
            `Authentication failed: ${errorText}`,
          ),
        });
        throw new McpError(
          McpErrorCode.AuthenticationFailed,
          `Authentication failed: ${response.status} ${response.statusText}`,
        );
      }
      
      // Parse response to get token if provided
      try {
        const data = await response.json();
        if (data.token) {
          this.authToken = data.token;
        }
      } catch (err) {
        // Ignore JSON parsing errors, auth might have succeeded
      }
      
      // Emit success event
      this.emitEvent({ type: 'auth_success' });
      
      // If we're not connected, try to reconnect with new auth
      if (!this._isConnected) {
        await this.connect();
      }
    } catch (err) {
      if (!(err instanceof McpError)) {
        this.emitEvent({ 
          type: 'auth_failure',
          error: new McpError(
            McpErrorCode.AuthenticationFailed,
            'Authentication request failed',
            err,
          ),
        });
      }
      throw err;
    }
  }

  public addEventListener(handler: McpTransportEventHandler): void {
    this.eventHandlers.push(handler);
  }

  public removeEventListener(handler: McpTransportEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  private emitEvent(event: McpTransportEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Error in event handler:', err);
      }
    }
  }
} 