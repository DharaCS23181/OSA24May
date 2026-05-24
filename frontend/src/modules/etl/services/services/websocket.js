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

    // Vite proxy proxies /ws -> ws://backend:8000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/pipeline/${pipelineId}`;
    
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
