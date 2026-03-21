"use client";

import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  ThumbsUp,
  Share2,
  Music,
  Plus,
} from "lucide-react";
import clsx from "clsx";

import type { SocialPlatform } from "./SocialMediaSection";

/* ═══════════════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════════════ */

type PostPreviewProps = {
  caption: string | null;
  image_url: string | null;
  platform: SocialPlatform;
};

/* ═══════════════════════════════════════════════════════════
   PHONE FRAME
   ═══════════════════════════════════════════════════════════ */

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[260px] shrink-0">
      {/* Outer bezel */}
      <div className="rounded-[2rem] border-[3px] border-gray-800 bg-gray-900 p-1 shadow-xl">
        {/* Inner screen */}
        <div className="relative overflow-hidden rounded-[1.6rem] bg-white">
          {/* Notch / dynamic island */}
          <div className="absolute top-2 left-1/2 z-20 h-[18px] w-[80px] -translate-x-1/2 rounded-full bg-gray-900" />

          {/* Screen content */}
          <div className="relative min-h-[460px]">{children}</div>

          {/* Home indicator */}
          <div className="flex justify-center py-2">
            <div className="h-1 w-[100px] rounded-full bg-gray-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   IMAGE BLOCK (shared)
   ═══════════════════════════════════════════════════════════ */

function ImageBlock({
  url,
  aspect,
}: {
  url: string | null;
  aspect: string;
}) {
  return (
    <div className={clsx("w-full bg-gray-100", aspect)}>
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-300 to-fuchsia-300">
          <span className="text-[10px] font-medium text-white/70">
            No image
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INSTAGRAM PREVIEW
   ═══════════════════════════════════════════════════════════ */

function InstagramPreview({ caption, image_url }: PostPreviewProps) {
  return (
    <>
      {/* Profile header */}
      <div className="flex items-center gap-2 px-3 pt-8 pb-2">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />
        <span className="text-[11px] font-semibold text-gray-900">
          yourbrand
        </span>
      </div>

      {/* Image */}
      <ImageBlock url={image_url} aspect="aspect-square" />

      {/* Action icons */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <Heart size={16} className="text-gray-900" />
          <MessageCircle size={16} className="text-gray-900" />
          <Send size={16} className="text-gray-900" />
        </div>
        <Bookmark size={16} className="text-gray-900" />
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-[10px] leading-relaxed text-gray-700">
          <span className="font-semibold">yourbrand</span>{" "}
          {caption || (
            <span className="text-gray-400 italic">No caption</span>
          )}
        </p>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   FACEBOOK PREVIEW
   ═══════════════════════════════════════════════════════════ */

function FacebookPreview({ caption, image_url }: PostPreviewProps) {
  return (
    <>
      {/* Profile header */}
      <div className="flex items-center gap-2 px-3 pt-8 pb-2">
        <div className="h-8 w-8 rounded-full bg-blue-500" />
        <div>
          <p className="text-[11px] font-semibold text-gray-900">
            Your Brand
          </p>
          <p className="text-[9px] text-gray-400">Just now</p>
        </div>
      </div>

      {/* Caption */}
      <div className="px-3 pb-2">
        <p className="text-[10px] leading-relaxed text-gray-700">
          {caption || (
            <span className="text-gray-400 italic">No caption</span>
          )}
        </p>
      </div>

      {/* Image */}
      <ImageBlock url={image_url} aspect="aspect-[16/9]" />

      {/* Reaction bar */}
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
        <button className="flex items-center gap-1 text-[10px] text-gray-500">
          <ThumbsUp size={12} /> Like
        </button>
        <button className="flex items-center gap-1 text-[10px] text-gray-500">
          <MessageCircle size={12} /> Comment
        </button>
        <button className="flex items-center gap-1 text-[10px] text-gray-500">
          <Share2 size={12} /> Share
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TIKTOK PREVIEW
   ═══════════════════════════════════════════════════════════ */

function TikTokPreview({ caption, image_url }: PostPreviewProps) {
  return (
    <div className="relative min-h-[460px] bg-black">
      {/* Full-screen image */}
      {image_url ? (
        <img
          src={image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900" />
      )}

      {/* Right sidebar icons */}
      <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Heart size={14} className="text-white" />
          </div>
          <span className="text-[8px] text-white/70">24.5K</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle size={14} className="text-white" />
          </div>
          <span className="text-[8px] text-white/70">312</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Share2 size={14} className="text-white" />
          </div>
          <span className="text-[8px] text-white/70">891</span>
        </div>
      </div>

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
        {/* Username */}
        <div className="flex items-center gap-2 mb-1">
          <div className="h-6 w-6 rounded-full bg-white/30" />
          <span className="text-[11px] font-semibold text-white">
            @yourbrand
          </span>
          <button className="rounded border border-white/40 px-2 py-0.5 text-[9px] font-medium text-white">
            Follow
          </button>
        </div>

        {/* Caption */}
        <p className="text-[10px] leading-relaxed text-white/90 line-clamp-2">
          {caption || (
            <span className="text-white/50 italic">No caption</span>
          )}
        </p>

        {/* Sound bar */}
        <div className="mt-2 flex items-center gap-1">
          <Music size={10} className="text-white/70" />
          <div className="h-[3px] flex-1 rounded-full bg-white/20">
            <div className="h-full w-1/3 rounded-full bg-white/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════ */

export default function PostPreview(props: PostPreviewProps) {
  return (
    <PhoneFrame>
      {props.platform === "Instagram" && <InstagramPreview {...props} />}
      {props.platform === "Facebook" && <FacebookPreview {...props} />}
      {props.platform === "TikTok" && <TikTokPreview {...props} />}
    </PhoneFrame>
  );
}
