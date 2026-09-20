interface Props {
  message: string | null;
  onDismiss: () => void;
}

export function Banner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    // Plain text, not innerHTML: banner messages interpolate user-controlled
    // strings (e.g. a .torrent file's info.name in the publish-success message),
    // so rendering them as HTML would be an injection surface.
    <div className="banner show">
      <span className="msg">{message}</span>
      <button className="close" onClick={onDismiss}>
        &times;
      </button>
    </div>
  );
}
