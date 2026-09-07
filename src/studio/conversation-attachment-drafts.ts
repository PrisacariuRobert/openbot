import type { Attachment } from "../shared/types";

type DraftFiles = {
  files: Attachment[];
  ready: boolean;
  uploading: boolean;
  error: string;
  retryable: boolean;
};
const empty: DraftFiles = {
  files: [],
  ready: false,
  uploading: false,
  error: "",
  retryable: false,
};

/** Owns only attachment selections. Text drafts are saved independently. */
export class ConversationAttachmentDrafts {
  private states = new Map<string, DraftFiles>();
  private listeners = new Set<() => void>();
  private loads = new Map<string, AbortController>();
  private retries = new Map<string, () => Promise<void>>();
  constructor(private request: typeof fetch = fetch) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get = (thread: string): DraftFiles => this.states.get(thread) || empty;
  private update(thread: string, patch: Partial<DraftFiles>) {
    this.states.set(thread, { ...this.get(thread), ...patch });
    this.listeners.forEach((listener) => listener());
  }
  private url(thread: string) {
    return `/api/drafts/${encodeURIComponent(thread)}/attachments`;
  }
  private async json<T>(url: string, options?: RequestInit): Promise<T> {
    // Browser fetch must not receive this controller as its `this` receiver.
    const request = this.request;
    const response = await request(url, options);
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || "Your files could not be saved. Please try again.",
      );
    return result as T;
  }
  cancelLoad(thread: string) {
    this.loads.get(thread)?.abort();
    this.loads.delete(thread);
  }
  async load(thread: string, background = false) {
    if (!thread || this.get(thread).uploading || this.retries.has(thread))
      return;
    this.cancelLoad(thread);
    const controller = new AbortController();
    this.loads.set(thread, controller);
    this.update(thread, {
      ready: background && this.get(thread).ready,
      error: "",
      retryable: false,
    });
    try {
      const files = await this.json<Attachment[]>(this.url(thread), {
        signal: controller.signal,
        cache: "no-store",
      });
      if (this.loads.get(thread) !== controller || controller.signal.aborted)
        return;
      this.update(thread, { files, ready: true });
    } catch (error) {
      if (this.loads.get(thread) !== controller || controller.signal.aborted)
        return;
      this.update(thread, {
        ready: false,
        error:
          error instanceof Error
            ? error.message
            : "Couldn’t restore your attached files.",
        retryable: true,
      });
    } finally {
      if (this.loads.get(thread) === controller) this.loads.delete(thread);
    }
  }
  private async perform(thread: string, operation: () => Promise<void>) {
    if (this.get(thread).uploading) return;
    this.cancelLoad(thread);
    this.update(thread, {
      uploading: true,
      ready: false,
      error: "",
      retryable: false,
    });
    this.retries.set(thread, operation);
    try {
      await operation();
      this.retries.delete(thread);
      this.update(thread, { ready: true });
    } catch (error) {
      this.update(thread, {
        error:
          error instanceof Error
            ? error.message
            : "Couldn’t save that change to your files.",
        retryable: true,
      });
    } finally {
      this.update(thread, { uploading: false });
    }
  }
  async add(thread: string, files: File[]) {
    if (!files.length || !this.get(thread).ready || this.get(thread).uploading)
      return;
    if (files.length + this.get(thread).files.length > 6) {
      this.update(thread, {
        error: "Choose up to six files for one message.",
        retryable: false,
      });
      return;
    }
    if (files.some((file) => !file.size || file.size > 25 * 1024 * 1024)) {
      this.update(thread, {
        error: "Choose non-empty files no larger than 25 MB.",
        retryable: false,
      });
      return;
    }
    const pending = files.map((file) => ({
      file,
      attachment: null as Attachment | null,
    }));
    let next = 0;
    await this.perform(thread, async () => {
      while (next < pending.length) {
        const item = pending[next]!;
        // A failed selection retry reuses an already uploaded file.
        item.attachment ||= await this.json<Attachment>(
          `/api/attachments?threadId=${encodeURIComponent(thread)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-File-Name": encodeURIComponent(item.file.name),
              "X-File-Type": item.file.type || "application/octet-stream",
            },
            body: item.file,
          },
        );
        const selected = await this.json<Attachment[]>(this.url(thread), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.attachment.id }),
        });
        this.update(thread, { files: selected });
        next++;
      }
    });
  }
  async remove(thread: string, id: string) {
    if (!this.get(thread).ready || this.get(thread).uploading) return;
    await this.perform(thread, async () => {
      const files = await this.json<Attachment[]>(
        `${this.url(thread)}/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      this.update(thread, { files });
    });
  }
  async retry(thread: string) {
    const operation = this.retries.get(thread);
    if (operation) await this.perform(thread, operation);
    else await this.load(thread);
  }
  clear(thread: string, ids: string[]) {
    // Sending claims attachments and clears their bindings in one DB transaction.
    this.cancelLoad(thread);
    this.update(thread, {
      files: this.get(thread).files.filter((file) => !ids.includes(file.id)),
      ready: true,
      error: "",
      retryable: false,
    });
  }
}
