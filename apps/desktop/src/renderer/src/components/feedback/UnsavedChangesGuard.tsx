import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

import { UnsavedChangesDialog } from './UnsavedChangesDialog';

interface UnsavedChangesGuardProps {
  readonly message?: string;
  readonly when: boolean;
}

export function UnsavedChangesGuard({ message, when }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (!when || typeof window === 'undefined') {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [when]);

  if (blocker.state !== 'blocked') {
    return null;
  }

  return (
    <UnsavedChangesDialog
      message={message}
      onCancel={() => blocker.reset()}
      onConfirm={() => blocker.proceed()}
    />
  );
}
