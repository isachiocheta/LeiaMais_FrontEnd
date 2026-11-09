import { useSyncExternalStore } from 'react';
import { meetingChanges } from '../services/meeting-changes.js';
export function useMeetingRevision() { return useSyncExternalStore(meetingChanges.subscribe, meetingChanges.snapshot); }
