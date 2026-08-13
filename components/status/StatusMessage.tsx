type StatusMessageProps = {
  title: string;
  detail: string;
};

export function StatusMessage({ title, detail }: StatusMessageProps) {
  return (
    <div className="status-message" role="status" aria-live="polite" aria-atomic="true">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
