'use client';

import type { Page } from '@/app/types';
import Whiteboard from './Whiteboard';

interface WhiteboardLoaderProps {
  sessionId: string;
  initialPages: Page[];
  sessionName: string;
}

export default function WhiteboardLoader({ sessionId, initialPages, sessionName }: WhiteboardLoaderProps) {
  return (
    <Whiteboard
      sessionId={sessionId}
      initialPages={initialPages}
      sessionName={sessionName}
    />
  );
}
