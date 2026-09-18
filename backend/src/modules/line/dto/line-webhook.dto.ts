export interface LineEventSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineDeliveryContext {
  isRedelivery: boolean;
}

export interface LineTextMessage {
  id: string;
  type: string;
  text?: string;
}

export interface LineUnsendDetail {
  messageId: string;
}

export interface LinePostbackDetail {
  data: string;
  params?: Record<string, any>;
}

export interface LineWebhookEvent {
  type: string;
  mode: 'active' | 'standby';
  timestamp: number;
  source: LineEventSource;
  webhookEventId: string;
  deliveryContext: LineDeliveryContext;
  replyToken?: string;
  message?: LineTextMessage;
  unsend?: LineUnsendDetail;
  postback?: LinePostbackDetail;
}

export interface LineWebhookPayload {
  destination: string;
  events: LineWebhookEvent[];
}
