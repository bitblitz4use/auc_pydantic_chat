import { DefaultChatTransport } from "ai";
import type { ChatTransport, ChatRequestOptions, UIMessageChunk, UIDataTypes, UITools } from "ai";

/**
 * Custom chat transport wrapper
 * Wraps DefaultChatTransport for potential future extensions
 */
export class CustomChatTransport implements ChatTransport<any, UIDataTypes, UITools> {
  private transport: DefaultChatTransport;

  constructor(config: { api: string }) {
    this.transport = new DefaultChatTransport(config);
  }

  async sendMessages(options: {
    trigger: "submit-message" | "regenerate-message";
    chatId: string;
    messageId: string | undefined;
    messages: any[];
    abortSignal: AbortSignal | undefined;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk<any, UIDataTypes>>> {
    return this.transport.sendMessages(options);
  }

  async reconnectToStream(options: ChatRequestOptions): Promise<ReadableStream<UIMessageChunk<any, UIDataTypes>> | null> {
    return this.transport.reconnectToStream(options);
  }
}
