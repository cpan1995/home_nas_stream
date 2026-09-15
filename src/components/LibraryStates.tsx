import { Film, FolderX, LoaderCircle, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ActionButton, Modal } from "./Controls";

function LibraryState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="library-state" role="status">
      {icon}
      <h1>{title}</h1>
      {children}
    </section>
  );
}
export function LoadingState() {
  return (
    <LibraryState icon={<LoaderCircle size={48} />} title="Loading movies">
      <p>Reading your media directory…</p>
    </LibraryState>
  );
}
export function EmptyLibraryState({
  retry,
  path,
}: {
  retry: () => void;
  path: string;
}) {
  return (
    <LibraryState icon={<Film size={48} />} title="No movies yet">
      <p>Add movie files to your library folder, then refresh.</p>
      <p className="source-path">{path}</p>
      <ActionButton onClick={retry}>Refresh library</ActionButton>
    </LibraryState>
  );
}
export function DisconnectedLibraryState({
  retry,
  error,
  path,
}: {
  retry: () => void;
  error: string;
  path: string;
}) {
  return (
    <LibraryState icon={<FolderX size={48} />} title="Library unavailable">
      <p>Check that your NAS is on and the movie folder is connected.</p>
      <p>{error}</p>
      <p className="source-path">{path}</p>
      <ActionButton variant="primary" onClick={retry}>
        Try again
      </ActionButton>
    </LibraryState>
  );
}
export function PlaybackErrorState({
  error,
  close,
  retry,
}: {
  error: string;
  close: () => void;
  retry: () => void;
}) {
  return (
    <Modal title="Unable to play movie" close={close}>
      <p className="error-message" role="alert">
        <CircleAlert />
        {error}
      </p>
      <div className="modal-actions">
        <ActionButton variant="primary" data-autofocus onClick={close}>
          Back to directory
        </ActionButton>
        <ActionButton onClick={retry}>Try again</ActionButton>
      </div>
    </Modal>
  );
}
