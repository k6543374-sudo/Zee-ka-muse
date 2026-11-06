/**
 * Optional remote blob store for PDF artifacts, backed by a private
 * Supabase Storage bucket through its REST API. Deploys on ephemeral
 * filesystems (for example a free host that wipes the disk on restart)
 * lose DATA_DIR, so file bytes are mirrored here: uploaded on import and
 * re-downloaded lazily when a read finds no local copy.
 */
import { backgroundFailure } from "./log.ts";

export interface RemoteStorageConfig {
  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  url: string;
  /** Service role key; server-only, never sent to the browser. */
  serviceKey: string;
  /** Private bucket that holds the PDFs. */
  bucket: string;
}

export class RemoteFileStore {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(config: RemoteStorageConfig) {
    this.base = `${config.url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(config.bucket)}`;
    this.headers = { authorization: `Bearer ${config.serviceKey}` };
  }

  private key(owner: string, id: string): string {
    return `${encodeURIComponent(owner)}/${id}.pdf`;
  }

  /** Create or overwrite the object; upsert so an import retry never 409s. */
  async upload(owner: string, id: string, bytes: Uint8Array): Promise<void> {
    const response = await fetch(`${this.base}/${this.key(owner, id)}`, {
      method: "POST",
      headers: {
        ...this.headers,
        "content-type": "application/pdf",
        "x-upsert": "true",
      },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok)
      throw new Error(
        `Supabase Storage upload failed (${response.status}): ${await response.text()}`,
      );
  }

  /** Null when the object does not exist; throws on any other failure. */
  async download(owner: string, id: string): Promise<Uint8Array | null> {
    const response = await fetch(`${this.base}/${this.key(owner, id)}`, {
      headers: this.headers,
    });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok)
      throw new Error(
        `Supabase Storage download failed (${response.status}): ${await response.text()}`,
      );
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** A failed remote upload must not reject the user's import; warn loudly instead. */
export async function mirrorUpload(
  remote: RemoteFileStore | undefined,
  owner: string,
  id: string,
  bytes: Uint8Array,
): Promise<void> {
  if (!remote) return;
  try {
    await remote.upload(owner, id, bytes);
  } catch (error) {
    backgroundFailure("remote file mirror", error);
  }
}
