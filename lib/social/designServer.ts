/**
 * Rendering side of designed posts. SERVER ONLY (pulls in next/og + sharp).
 */

import { designIsRendered, renderDesign } from "./renderSlides";
import { designFields } from "./server";
import type { SocialPost } from "./types";

/**
 * For a designed post: compile caption/type and (re)render any stale slides.
 * Returns the fields to write; a post without a design comes back unchanged.
 */
export async function syncDesign(post: SocialPost): Promise<Partial<SocialPost>> {
  if (!post.design) return {};
  const fields = designFields(post.design);
  if (designIsRendered(post.id, post.brand, post.design, post.media)) return fields;
  const media = await renderDesign(post.id, post.brand, post.design, post.media);
  return { ...fields, media };
}
