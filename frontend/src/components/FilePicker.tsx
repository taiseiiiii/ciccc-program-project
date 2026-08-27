import { useTranslation } from "react-i18next";

interface FilePickerProps {
  /** Files staged for upload. Nothing has been sent anywhere yet. */
  files: File[];
  /** The full replacement list — picks are appended, removals filtered out. */
  onChange: (files: File[]) => void;
}

/**
 * Photos and videos chosen for one climb, before they are uploaded.
 *
 * Shared by the log screen, where the files wait for the visit to be saved, and
 * by the climb editor, where they wait for the climb they are being attached
 * to. It used to exist only on the log screen, which is why a photo forgotten
 * on the day could never be added afterwards: there was no picker anywhere on
 * a session that had already been saved.
 *
 * Uploading is the caller's job — both screens need an id that only exists
 * once their own save has come back.
 */
export default function FilePicker({ files, onChange }: FilePickerProps) {
  // The strings live under `log.` because that is where this markup started;
  // they read the same in the editor.
  const { t } = useTranslation("sessions");

  return (
    <div className="mt-3">
      <p className="text-label-md text-on-surface-variant mb-2">
        {t("log.media.label")}
      </p>
      <input
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          onChange([...files, ...picked]);
          // Clear the input so re-picking the same file fires onChange again.
          e.target.value = "";
        }}
        className="block w-full text-body-sm text-on-surface-variant file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-container-high file:text-on-surface file:cursor-pointer"
      />
      {files.length > 0 && (
        <ul className="flex flex-col gap-1 mt-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between gap-2 text-body-sm text-on-surface-variant"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                aria-label={t("log.media.remove", { name: file.name })}
                onClick={() => onChange(files.filter((_, index) => index !== i))}
                className="cursor-pointer hover:text-on-surface shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-label-sm text-on-surface-variant mt-1.5">
        {t("log.media.hint")}
      </p>
    </div>
  );
}
