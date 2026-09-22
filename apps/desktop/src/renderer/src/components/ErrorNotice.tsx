interface ErrorNoticeProps {
  readonly message: string;
}

export function ErrorNotice({ message }: ErrorNoticeProps) {
  return (
    <div className="error-notice" role="alert">
      {message}
    </div>
  );
}
