import { useState } from 'react';
import type { Dataset } from '../domain/types';
import { downloadText } from '../export/download';
import { buildIcs, icsFileName } from '../export/ics';
import { Modal } from './Modal';

interface Props {
  ds: Dataset;
  initialTeamId: string | null;
  onClose: () => void;
}

export function ExportDialog({ ds, initialTeamId, onClose }: Props) {
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const count = ds.releases.filter((r) => !teamId || ds.products.find((p) => p.id === r.productId)?.teamId === teamId).length;
  return (
    <Modal
      title="Export calendar feed"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!count}
            onClick={() => {
              downloadText(icsFileName(ds, teamId), 'text/calendar', buildIcs(ds, { teamId }));
              onClose();
            }}
          >
            Download .ics ({count} release{count === 1 ? '' : 's'})
          </button>
        </>
      }
    >
      <p className="max-w-prose text-sm text-ink-soft">
        An iCalendar file you can import into Google Calendar, Outlook, or Apple Calendar. It includes blackout, freeze, and maintenance windows as
        free-time events.
      </p>
      <label htmlFor="export-team" className="label mt-4">
        Releases to include
      </label>
      <select id="export-team" className="field" value={teamId ?? ''} onChange={(e) => setTeamId(e.target.value || null)}>
        <option value="">All teams</option>
        {ds.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </Modal>
  );
}
