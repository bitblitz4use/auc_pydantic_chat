import { DefaultChatTransport } from "ai";
import type { ChatTransport, ChatRequestOptions, UIMessageChunk, UIDataTypes, UITools } from "ai";

/**
 * Simple chat transport that passes body parameters directly to DefaultChatTransport
 */
export class SimpleChatTransport implements ChatTransport<any, UIDataTypes, UITools> {
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
    // Pass through all options including body directly to DefaultChatTransport
    return this.transport.sendMessages(options);
  }

  async reconnectToStream(options: ChatRequestOptions): Promise<ReadableStream<UIMessageChunk<any, UIDataTypes>> | null> {
    return this.transport.reconnectToStream(options);
  }
}
