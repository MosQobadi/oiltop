// Outbound customer notifications (back-in-stock alerts today, order updates
// later). No email/SMS provider has been chosen for this project yet — that
// decision is deliberately deferred, see Design Decision 9 in
// topoil-storefront-claude-code-tasks.md — so this logs instead of sending.
// When a provider is picked, replace the body of sendNotification and every
// caller keeps working unchanged.
//
// `to` is whatever the customer typed on the storefront: an email address or a
// phone number. Picking the transport from that shape is the provider
// integration's job, not the caller's.
export interface NotificationMessage {
  to: string;
  subject: string;
  body: string;
}

export async function sendNotification(message: NotificationMessage): Promise<void> {
  // TODO: send through a real email/SMS provider once one is configured.
  console.info(
    `[notify] (not sent — no provider configured) to=${message.to} subject=${message.subject}`,
  );
}
