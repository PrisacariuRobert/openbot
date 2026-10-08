/** The two Mac triggers' settings in the routine editor (task F5): which folder,
 * and which mail. Kept out of CapabilityPanels.tsx, which is already too big. */
export function FolderTriggerFields({ folderPath, fileTypes, onFolderPath, onFileTypes }: { folderPath: string; fileTypes: string; onFolderPath: (value: string) => void; onFileTypes: (value: string) => void }) {
  return (
    <fieldset className="routine-fieldset">
      <legend>Which folder?</legend>
      <div className="trigger-fields">
        <label>
          <span>Folder on this Mac</span>
          <input value={folderPath} onChange={(event) => onFolderPath(event.target.value)} placeholder="~/Documents/Receipts" spellCheck={false} autoCapitalize="off" />
        </label>
        <label>
          <span>File types</span>
          <input value={fileTypes} onChange={(event) => onFileTypes(event.target.value)} placeholder="pdf, jpg (optional)" spellCheck={false} autoCapitalize="off" />
        </label>
      </div>
      <small className="routine-help">Files already in the folder never start a run. When new files arrive, Sidemates waits until the folder has been quiet for half a minute, then starts one run for all of them, at most six an hour. Needs Files &amp; apps on this Mac.</small>
    </fieldset>
  );
}

export function MailTriggerFields({ mailFrom, mailSubject, onMailFrom, onMailSubject }: { mailFrom: string; mailSubject: string; onMailFrom: (value: string) => void; onMailSubject: (value: string) => void }) {
  return (
    <fieldset className="routine-fieldset">
      <legend>Which mail?</legend>
      <div className="trigger-fields">
        <label>
          <span>From contains</span>
          <input value={mailFrom} onChange={(event) => onMailFrom(event.target.value)} placeholder="accountant@" spellCheck={false} autoCapitalize="off" />
        </label>
        <label>
          <span>Subject contains</span>
          <input value={mailSubject} onChange={(event) => onMailSubject(event.target.value)} placeholder="invoice" />
        </label>
      </div>
      <small className="routine-help">Fill in at least one. Sidemates checks new unread mail in the Mail app on this Mac; mail that's already there never starts a run, and new matches arriving together start one run, at most six an hour. Needs Files &amp; apps on this Mac.</small>
    </fieldset>
  );
}
