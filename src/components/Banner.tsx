interface Props {
  message: string | null;
  onDismiss: () => void;
}

export function Banner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div className="banner show">
      <span className="msg" dangerouslySetInnerHTML={{ __html: message }} />
      <button className="close" onClick={onDismiss}>
        &times;
      </button>
    </div>
  );
}
