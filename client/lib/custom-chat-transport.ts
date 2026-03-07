import { DefaultChatTransport } from "ai";
import type { ChatTransport, ChatRequestOptions, UIMessageChunk, UIDataTypes, UITools } from "ai";

/**
 * Custom chat transport that supports custom headers
 * Wraps DefaultChatTransport and adds header support
 */
export class CustomChatTransport implements ChatTransport<any, UIDataTypes, UITools> {
  private transport: DefaultChatTransport;
  private headers: Record<string, string> = {};

  constructor(config: { api: string }) {
    this.transport = new DefaultChatTransport(config);
  }

  /**
   * Set headers to be sent with each request
   */
  setHeaders(headers: Record<string, string>) {
    // Replace all headers (don't merge, replace)
    this.headers = { ...headers };
  }

  /**
   * Send messages with custom headers
   */
  async sendMessages(options: {
    trigger: "submit-message" | "regenerate-message";
    chatId: string;
    messageId: string | undefined;
    messages: any[];
    abortSignal: AbortSignal | undefined;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk<any, UIDataTypes>>> {
    // Start with custom headers first (they take precedence)
    const headers = new Headers();
    
    // Add custom headers first
    Object.entries(this.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });
    
    // Then merge any headers from options (but custom headers take precedence)
    if (options.headers) {
      const optionsHeaders = new Headers(options.headers);
      optionsHeaders.forEach((value, key) => {
        // Only set if not already set by custom headers
        if (!this.headers[key]) {
          headers.set(key, value);
        }
      });
    }

    // Debug: log headers being sent
    console.log("Transport sending headers:", Object.fromEntries(headers.entries()));
    console.log("Custom headers stored:", this.headers);

    return this.transport.sendMessages({
      ...options,
      headers,
    });
  }

  /**
   * Reconnect to stream
   */
  async reconnectToStream(options: ChatRequestOptions): Promise<ReadableStream<UIMessageChunk<any, UIDataTypes>> | null> {
    return this.transport.reconnectToStream(options);
  }
}
