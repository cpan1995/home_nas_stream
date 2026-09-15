import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { focusControl } from "../hooks/useRemoteNavigation";

export function ActionButton({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      {...props}
      className={`action-button focus-ring ${variant} ${className}`}
    />
  );
}

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    dialog.showModal();
    focusControl(
      dialog.querySelector<HTMLElement>("[data-autofocus]") ||
        dialog.querySelector<HTMLElement>("button"),
    );
    return () => {
      dialog.close();
      if (previous.isConnected) focusControl(previous);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <ActionButton aria-label="Close dialog" onClick={close}>
          <X />
        </ActionButton>
      </div>
      {children}
    </dialog>
  );
}
