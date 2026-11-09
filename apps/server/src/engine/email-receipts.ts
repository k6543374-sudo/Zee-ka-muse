import { type BaseEvent, EventType } from "@ag-ui/core";
import { Observable } from "rxjs";
import type { ActionProposal } from "../../../../packages/domain/src/index.ts";

// This is deliberately conservative: model prose is not a send receipt. Match
// common English/Hinglish claims, including claims split across streaming chunks.
export const emailSendClaim = (text: string) =>
  /\b(?:e-?mail|message)\b[\s\S]{0,100}\b(?:sent|delivered|bhej\s+di(?:ya|yi)|send\s+kar\s+diya)\b|\b(?:I|we|I've|we've|I have|we have)\s+(?:successfully\s+)?(?:sent|emailed|delivered)\b|\b(?:sent|emailed)\b[\s\S]{0,80}[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:bhej\s+diya|email\s+kar\s+diya)\b/i.test(
    text,
  ) &&
  !/^(?:I (?:have )?not sent|No (?:email|message) (?:was|has been) sent)[.!\s]*$/i.test(
    text.trim(),
  );

export const emailSendTask = (text: string) =>
  /\b(?:send|sending|resend)\b[\s\S]{0,160}(?:@|\b(?:email|e-mail|mail|message)\b)|^(?:email|e-mail)\s+(?:to\s+)?[\w.+-]+@[\w.-]+/i.test(
    text,
  );

export function gmailReceipts(actions: ActionProposal[], taskId?: string) {
  return actions.filter(
    (a) =>
      a.kind === "email.send" &&
      a.status === "succeeded" &&
      (!taskId || a.taskId === taskId) &&
      /^Gmail sent message · [a-zA-Z0-9_-]+$/.test(a.result ?? ""),
  );
}

export function emailReceiptText(actions: ActionProposal[]): string {
  const receipts = gmailReceipts(actions);
  if (!receipts.length)
    return "I cannot confirm that an email was sent. A draft, queued task or approval is not a send receipt. Check Activity for the reviewed action; Gmail must return a message ID before I can confirm sending.";
  return (
    "Recorded Gmail receipts (these may be earlier actions, not a new send):\n" +
    receipts
      .map((a) => {
        const to = (a.data as { to?: string[] }).to?.join(", ") || "the reviewed recipients";
        return `Gmail accepted the reviewed email to ${to} (${a.createdAt}). ${a.result}. This confirms sending, not delivery to the recipient's inbox.`;
      })
      .join("\n")
  );
}

/** Buffer only assistant text; tool events stay live. Never let a partial false
 * "sent" claim reach the client and then try to retract it with later chunks. */
export function guardEmailClaims(
  source: Observable<BaseEvent>,
  actions: () => Promise<ActionProposal[]>,
) {
  return new Observable<BaseEvent>((subscriber) => {
    let pending: BaseEvent[] = [];
    let queue = Promise.resolve();
    let cancelled = false;
    const flush = async (batch: BaseEvent[]) => {
      if (!batch.length) return;
      const text = batch.map((e) => (e as { delta?: string }).delta ?? "").join("");
      if (!emailSendClaim(text)) {
        if (!cancelled) batch.forEach((e) => subscriber.next(e));
        return;
      }
      // Match exact recipients in this reply; an unrelated prior sent email
      // cannot establish this claim. No match means no confirmation.
      const addresses = new Set(text.toLowerCase().match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g) ?? []);
      let matching: ActionProposal[] = [];
      try {
        matching = gmailReceipts(await actions()).filter((a) =>
          (a.data as { to?: string[] }).to?.some((to) => addresses.has(to.toLowerCase())),
        );
      } catch {
        /* Failure to read receipts must fail closed. */
      }
      if (!cancelled)
        subscriber.next({ ...batch[0], delta: emailReceiptText(matching) } as BaseEvent);
    };
    const sub = source.subscribe({
      next(event) {
        if (
          event.type === EventType.TEXT_MESSAGE_CHUNK ||
          event.type === EventType.TEXT_MESSAGE_CONTENT
        ) {
          pending.push(event);
          return;
        }
        const batch = pending;
        pending = [];
        queue = queue.then(async () => {
          await flush(batch);
          if (!cancelled) subscriber.next(event);
        });
      },
      error(error) {
        queue.then(() => {
          if (!cancelled) subscriber.error(error);
        });
      },
      complete() {
        const batch = pending;
        pending = [];
        queue.then(async () => {
          await flush(batch);
          if (!cancelled) subscriber.complete();
        });
      },
    });
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  });
}
