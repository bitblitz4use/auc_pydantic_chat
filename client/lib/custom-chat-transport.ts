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
    const headers = new Headers(options.headers);
    
    // Add custom headers
    Object.entries(this.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });

    // Debug: log headers being sent
    console.log("Transport sending headers:", Object.fromEntries(headers.entries()));

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
