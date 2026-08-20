import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { deleteMedia, signMediaUrls } from "../lib/storage";
import type Media from "../types/MediaType";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";

interface MediaGalleryProps {
  /** The attachments to show. Already filtered to one climb or one visit. */
  media: Media[];
  /** Invalidated after a delete, so the caller's list refetches. */
  onChanged: () => void;
}

/**
 * Photos and videos, with a way to remove them.
 *
 * The upload half of this feature shipped and the viewing half did not:
 * `signMediaUrls` and `deleteMedia` existed in lib/storage.ts and were imported
 * by nothing, so a climber could attach a video to a send and then never see it
 * again or reclaim the space. This is the other half.
 *
 * The bucket is private, so displaying anything means asking Storage for
 * short-lived signed URLs — batched into one request for the whole set rather
 * than one per thumbnail.
 */
export default function MediaGallery({ media, onChanged }: MediaGalleryProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<Media | null>(null);

  // Keyed by the paths themselves: a signed URL is only valid for the object it
  // was signed for, and the set changes as attachments come and go. The paths
  // determine the result, so they are the whole key — `media` carries metadata
  // the URLs do not depend on.
  const paths = media.map((m) => m.storage_path);
  const byPath = new Map(media.map((m) => [m.storage_path, m]));

  const { data: urls, isPending } = useQuery({
    queryKey: ["media-urls", paths],
    queryFn: ({ queryKey }) => {
      const [, keyPaths] = queryKey as [string, string[]];
      return signMediaUrls(
        keyPaths.map((path) => byPath.get(path)!).filter(Boolean),
      );
    },
    enabled: media.length > 0,
    // Signed for an hour; refetching sooner just burns requests.
    staleTime: 50 * 60 * 1000,
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (mediaId: number) => deleteMedia(mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setPendingDelete(null);
      onChanged();
      toast.success(t("media.deleted"));
    },
    onError: (err) => toast.error(err.message),
  });

  if (media.length === 0) return null;

  return (
    <div className="mt-3">
      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete.media_id)}
        title={t("media.confirmTitle")}
        message={t("media.confirmBody")}
        isPending={isDeleting}
      />

      {isPending ? (
        <p className="text-label-sm text-on-surface-variant">Loading media...</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 list-none p-0 m-0">
          {media.map((item) => {
            const url = urls?.[item.storage_path];
            return (
              <li
                key={item.media_id}
                className="relative group rounded-lg overflow-hidden bg-surface-container-high aspect-square"
              >
                {!url ? (
                  <div className="w-full h-full flex items-center justify-center text-label-sm text-on-surface-variant p-2 text-center">
                    Unavailable
                  </div>
                ) : item.kind === "video" ? (
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                )}

                <Button
                  variant="error"
                  aria-label={t("media.deleteLabel")}
                  onClick={() => setPendingDelete(item)}
                  className="absolute top-1 right-1 px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ✕
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
