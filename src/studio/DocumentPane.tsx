import { useEffect, useRef, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Attachment } from "../shared/types";
import { newerDeliveredVersion } from "./artifact-versions";

/** Preview only stored attachment content; ancestry comes from explicit IDs. */
export function DocumentPane({ file, files, modal, canRevise, onClose, onRevise }: {
  file: Attachment; files: Attachment[]; modal: boolean; canRevise: boolean; onClose: () => void; onRevise: (file: Attachment) => void;
}) {
  const [selected, setSelected] = useState(file);
  const dialog = useRef<HTMLDialogElement>(null);
  const pane = useRef<HTMLElement>(null);
  const latest = newerDeliveredVersion(file, files) || file;
  const versions: Attachment[] = [];
  let current: Attachment | undefined = latest;
  while (current && !versions.some(item => item.id === current!.id)) {
    versions.push(current);
    current = files.find(item => item.id === current?.replacesAttachmentId && item.threadId === file.threadId && item.source === "artifact" && item.revision < current!.revision);
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (modal) dialog.current?.showModal(); else pane.current?.focus();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, [modal]);
  const content = <>
    <header><FileText size={18}/><span><strong>{file.name}</strong><small>Stored result · read only</small></span><button aria-label="Close document" onClick={onClose}><X size={18}/></button></header>
    <div className="document-version-bar"><label>Version <select aria-label="Document version" value={selected.id} onChange={event => setSelected(versions.find(item => item.id === event.target.value)!)}>{versions.map(item => <option key={item.id} value={item.id}>Revision {item.revision}{item.id === latest.id ? " · latest available" : " · earlier"}</option>)}</select></label></div>
    <div className="document-reader"><article>{selected.previewText ? <ReactMarkdown skipHtml disallowedElements={["img"]}>{selected.previewText}</ReactMarkdown> : selected.kind === "image" && selected.previewUrl ? <img src={selected.previewUrl} alt={selected.name}/> : <p>A text preview is unavailable. Open the original file below.</p>}{selected.processingStatus === "partial" && <p className="document-preview-note">Partial preview. The original file contains the full result.</p>}</article></div>
    <footer><a href={selected.url} target="_blank" rel="noreferrer"><Download size={15}/> Open original</a><button disabled={!canRevise} title={canRevise ? "Prepare a revision request in your draft" : "Restoring your draft"} onClick={() => { onRevise(selected); if (modal) onClose(); }}>Ask for a change</button></footer>
  </>;
  return modal ? <dialog ref={dialog} className="document-pane document-pane-mobile" aria-label="Document preview" onCancel={onClose}>{content}</dialog> : <aside ref={pane} tabIndex={-1} className="document-pane" aria-label="Document preview" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>{content}</aside>;
}
