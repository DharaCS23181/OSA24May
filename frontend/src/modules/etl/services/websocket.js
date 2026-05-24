class WebSocketManager {
  constructor() {
    this.ws = null;
    this.pipelineId = null;
    this.handlers = new Set();
    this.reconnectTimer = null;
  }

  connect(pipelineId) {
    if (this.ws?.readyState === WebSocket.OPEN && this.pipelineId === pipelineId) {
      return;
    }

    this.disconnect();
    this.pipelineId = pipelineId;

    // In dev, Vite proxies /etl-ws/* to ws://localhost:8111
    // In production, VITE_ETL_API_URL should be set to the ETL backend base URL
    const etlBase = import.meta.env.VITE_ETL_API_URL || '';
    let wsUrl;
    if (etlBase) {
      // Production: use the ETL backend URL directly with ws/wss protocol
      const wsBase = etlBase.replace(/^http/, 'ws');
      wsUrl = `${wsBase}/ws/pipeline/${pipelineId}`;
    } else {
      // Dev: use Vite proxy — /etl/* → ws://localhost:8111/*
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/etl/ws/pipeline/${pipelineId}`;
    }
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.forEach(handler => handler(data));
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    this.ws.onclose = () => {
      // Basic auto-reconnect fallback
      this.reconnectTimer = window.setTimeout(() => {
        if (this.pipelineId) this.connect(this.pipelineId);
      }, 5000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
      this.pipelineId = null;
    }
  }

  subscribe(handler) {
    this.handlers.add(handler);
    return () => this.unsubscribe(handler);
  }

  unsubscribe(handler) {
    this.handlers.delete(handler);
  }
}

export const wsManager = new WebSocketManager();
