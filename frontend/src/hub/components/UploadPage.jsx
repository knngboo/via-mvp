import { useRef, useState, useEffect } from 'react';
import '../styles/UploadPage.css';
import '../styles/SubmissionsPage.css';
import { useCsv } from '../../context/CsvContext';
import AppLayout from './AppLayout';
import SubmissionContext from './SubmissionContext';
import { parseCsvFile } from '../../services/csvParser';
import { listSources, uploadSource } from '../../services/sources';

const FOLDERS = ['Housing', 'Safety', 'Infrastructure'];

const formatBytes = (bytes) => {
  if (!bytes) return 'N/A';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatBatchDate = () => {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    + ' ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    + ' Queue';
};

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

export default function UploadPage() {
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);
  const { batches, setBatches, csvData, setCsvData, setFileName, setCsvStats } = useCsv();
  const [pendingCsvData, setPendingCsvData] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [dbSources, setDbSources] = useState([]);

  // Load sources persisted in MongoDB; the page still works if the backend
  // is unreachable, it just shows local batches only.
  useEffect(() => {
    listSources()
      .then(setDbSources)
      .catch(() => {});
  }, []);

  const [isDragging, setIsDragging]           = useState(false);
  const [isUploading, setIsUploading]         = useState(false);
  const [uploadError, setUploadError]         = useState('');
  const [showTos, setShowTos]                 = useState(() => !localStorage.getItem('tos_agreed'));

  const [folderFilter, setFolderFilter]       = useState('all');
  const [sortFilter, setSortFilter]           = useState('default');
  const [batchSortState, setBatchSortState]   = useState({});
  const [openDropdown, setOpenDropdown]       = useState(null);

  const [contextOpen, setContextOpen]         = useState(false);
  const [pendingUpload, setPendingUpload]     = useState(null); // { fileName, fileSize }

  const toggleDropdown = (name) => setOpenDropdown(prev => prev === name ? null : name);

  // Database sources not already present in a local batch get their own
  // read-only batch so everything stored in Mongo is visible here.
  const localNames = new Set(batches.flatMap(b => b.files.map(f => f.name)));
  const dbFiles = dbSources
    .filter(s => !localNames.has(s.name))
    .map(s => ({
      id: `db-${s._id}`,
      sourceId: s._id,
      name: s.name,
      folder: s.folder,
      status: s.status || 'Ready',
      tier: s.tier,
      size: formatBytes(s.size),
      confidence: s.confidence || 'High',
      issue: '',
      csvData: s.sample || [],
    }));
  const displayBatches = dbFiles.length > 0
    ? [...batches, { id: 'db-sources', label: 'Synced from Database', files: dbFiles }]
    : batches;

  const allFiles = displayBatches.flatMap(b => b.files).map(f => ({ ...f, hasError: f.status === 'Error' }));
  const errorCount = allFiles.filter(f => f.hasError).length;
  const readyCount = allFiles.filter(f => !f.hasError).length;
  const hasFiles   = allFiles.length > 0;

  const handleFile = async (file) => {
    const isCsvByType = file && file.type === 'text/csv';
    const isCsvByName = file && /\.csv$/i.test(file.name || '');
    if (!file || (!isCsvByType && !isCsvByName)) {
      setUploadError('Please upload a valid CSV file.');
      return;
    }
    setIsUploading(true);
    setUploadError('');
    try {
      const result = await parseCsvFile(file);
      setFileName(result.filename);
      setCsvData(result.data);
      setCsvStats(result.stats);
      setPendingCsvData(result.data);
      setPendingFile(file);
      setPendingUpload({ fileName: result.filename, fileSize: file.size });
      setContextOpen(true);
    } catch (error) {
      setUploadError(error.message || 'Failed to parse CSV.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => handleFile(e.target.files[0]);

  // Page-wide drag-and-drop: dropping a CSV anywhere on the page uploads it.
  useEffect(() => {
    const containsFiles = (e) =>
      Array.from(e.dataTransfer?.types || []).includes('Files');

    const onDragEnter = (e) => {
      if (!containsFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      setIsDragging(true);
    };
    const onDragOver = (e) => {
      if (!containsFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e) => {
      if (!containsFiles(e)) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setIsDragging(false);
    };
    const onDrop = (e) => {
      if (!containsFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover',  onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop',      onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover',  onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop',      onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTosAgree = () => {
    localStorage.setItem('tos_agreed', 'true');
    setShowTos(false);
  };

  const parseSize = (s) => {
    if (!s || s === 'N/A') return 0;
    const num = parseFloat(s);
    if (s.includes('MB')) return num * 1024 * 1024;
    if (s.includes('KB')) return num * 1024;
    return num;
  };

  const handleColSort = (batchId, col) => {
    setBatchSortState(prev => {
      const cur = prev[batchId] || { col: null, dir: 'asc' };
      return {
        ...prev,
        [batchId]: {
          col,
          dir: cur.col === col && cur.dir === 'asc' ? 'desc' : 'asc',
        },
      };
    });
  };

  const getFilteredFiles = (files, batchId) => {
    let result = [...files];
    if (folderFilter !== 'all') result = result.filter(f => f.folder === folderFilter);
    const { col: sortCol, dir: sortDir } = batchSortState[batchId] || { col: null, dir: 'asc' };
    if (sortCol) {
      result.sort((a, b) => {
        let aVal = a[sortCol];
        let bVal = b[sortCol];
        if (sortCol === 'size') {
          aVal = parseSize(aVal);
          bVal = parseSize(bVal);
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    } else {
      if (sortFilter === 'az') result.sort((a, b) => a.name.localeCompare(b.name));
      if (sortFilter === 'za') result.sort((a, b) => b.name.localeCompare(a.name));
    }
    return result;
  };

  return (
    <AppLayout>

      {/* ── Terms of Service Modal (first login only) ── */}
      {showTos && (
        <div className="tos-overlay">
          <div className="tos-modal">
            <h2 className="tos-title">Terms of Service</h2>
            <p className="tos-body">
              By clicking &ldquo;agree&rdquo; you acknowledge that you have read and understood the legal requirements of each policy.
            </p>
            <div className="tos-section">
              <h3 className="tos-section-title">Scope of Exchange</h3>
              <p className="tos-section-body">
                This platform facilitates the secure exchange and analysis of data between authorized parties in accordance with Better Futures Institute&rsquo;s data governance policies. Users are responsible for ensuring that all data submitted complies with applicable laws and internal guidelines.
              </p>
            </div>
            <button className="tos-agree-btn" onClick={handleTosAgree}>Agree</button>
          </div>
        </div>
      )}

      <div className="queue-page" onClick={() => openDropdown && setOpenDropdown(null)}>

        {/* ── Full-page drag overlay ── */}
        {isDragging && (
          <div className="page-drag-overlay">
            <div className="page-drag-overlay-inner">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                <polyline points="16 16 12 12 8 16"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
              </svg>
              <span className="page-drag-overlay-title">Drop your CSV to upload</span>
            </div>
          </div>
        )}

        {/* ── Top Bar ── */}
        <div className="sources-topbar">
          <div className="sources-topbar-left">
            <h1 className="sources-title">
              My Sources
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </h1>
          </div>
          <div className="sources-topbar-right">
            <div className="storage-indicator">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              </svg>
              <span className="storage-text">Storage</span>
              <span className="storage-used">3 GB Used</span>
            </div>
            <button className="storage-info-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </button>
            <button className="upload-btn" onClick={() => fileInputRef.current.click()}>Upload</button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="upload-input-hidden"
        />

        {/* ── Upload Dropzone (compact, always visible) ── */}
        <div
          className={`sources-dropzone sources-dropzone--compact${isDragging ? ' dragging' : ''}`}
          onClick={() => fileInputRef.current.click()}
        >
          <div className="dropzone-compact-inner">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              <polyline points="16 16 12 12 8 16"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
            </svg>
            <div className="dropzone-compact-text">
              <span className="dropzone-compact-title">
                {isDragging ? 'Drop to upload' : 'Drag a CSV here or click to upload'}
              </span>
              <span className="dropzone-compact-sub">
                {isUploading ? 'Uploading...' : uploadError || 'Files appear in the queue below once processed.'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Section Header for Queue ── */}
        <div className="sources-queue-header">
          <h2 className="sources-queue-title">Ingested Data &amp; Sources</h2>
        </div>

        {/* ── Filter Pills ── */}
        <div className="sources-filters" onClick={e => e.stopPropagation()}>
          <div className="filter-pill-wrap">
            <button className={`filter-pill${folderFilter !== 'all' ? ' filter-active' : ''}`} onClick={() => toggleDropdown('people')}>
              {folderFilter === 'all' ? 'Folder' : folderFilter}
              <ChevronDown />
            </button>
            {openDropdown === 'people' && (
              <div className="filter-dropdown">
                <button className={`filter-dropdown-item${folderFilter === 'all' ? ' selected' : ''}`} onClick={() => { setFolderFilter('all'); setOpenDropdown(null); }}>All Folders</button>
                {FOLDERS.map(f => (
                  <button key={f} className={`filter-dropdown-item${folderFilter === f ? ' selected' : ''}`} onClick={() => { setFolderFilter(f); setOpenDropdown(null); }}>{f}</button>
                ))}
              </div>
            )}
          </div>

          <div className="filter-pill-wrap">
            <button className={`filter-pill${sortFilter !== 'default' ? ' filter-active' : ''}`} onClick={() => toggleDropdown('modified')}>
              {sortFilter === 'default' ? 'Modified' : sortFilter === 'az' ? 'Name A–Z' : 'Name Z–A'}
              <ChevronDown />
            </button>
            {openDropdown === 'modified' && (
              <div className="filter-dropdown">
                <button className={`filter-dropdown-item${sortFilter === 'default' ? ' selected' : ''}`} onClick={() => { setSortFilter('default'); setOpenDropdown(null); }}>Default</button>
                <button className={`filter-dropdown-item${sortFilter === 'az'      ? ' selected' : ''}`} onClick={() => { setSortFilter('az');      setOpenDropdown(null); }}>Name A–Z</button>
                <button className={`filter-dropdown-item${sortFilter === 'za'      ? ' selected' : ''}`} onClick={() => { setSortFilter('za');      setOpenDropdown(null); }}>Name Z–A</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Queue (list view only) ── */}
        {!hasFiles ? (
          <p className="queue-no-results">No files yet. Upload a CSV above to get started.</p>
        ) : (
          displayBatches.map((batch) => {
            const batchFiles = batch.files.map(f => ({ ...f, hasError: f.status === 'Error' }));
            const filtered = getFilteredFiles(batchFiles, batch.id);
            const batchSort = batchSortState[batch.id] || { col: null, dir: 'asc' };
            if (filtered.length === 0) return null;
            return (
              <div key={batch.id} className="queue-batch">
                <div className="queue-batch-header" onClick={e => e.stopPropagation()}>
                  <span className="queue-batch-title">{batch.label}</span>

                  <div className="filter-pill-wrap">
                    <button
                      className={`queue-batch-folder-tag${folderFilter !== 'all' ? ' tag-active' : ''}`}
                      onClick={() => toggleDropdown(`folderTag-${batch.id}`)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      {folderFilter === 'all' ? 'Folder' : folderFilter}
                      {folderFilter !== 'all' && (
                        <span className="queue-batch-folder-remove" onClick={(e) => { e.stopPropagation(); setFolderFilter('all'); }}>×</span>
                      )}
                      <ChevronDown />
                    </button>
                    {openDropdown === `folderTag-${batch.id}` && (
                      <div className="filter-dropdown">
                        <button className={`filter-dropdown-item${folderFilter === 'all' ? ' selected' : ''}`} onClick={() => { setFolderFilter('all'); setOpenDropdown(null); }}>All Folders</button>
                        {FOLDERS.map(f => (
                          <button key={f} className={`filter-dropdown-item${folderFilter === f ? ' selected' : ''}`} onClick={() => { setFolderFilter(f); setOpenDropdown(null); }}>{f}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <table className="queue-table">
                  <thead>
                    <tr>
                      {[
                        { label: 'Name',      col: 'name' },
                        { label: 'Folder',    col: 'folder' },
                        { label: 'File Size', col: 'size' },
                      ].map(({ label, col }) => (
                        <th key={col} onClick={() => handleColSort(batch.id, col)}>
                          {label}
                          {batchSort.col === col ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 3, verticalAlign: 'middle' }}>
                              {batchSort.dir === 'asc'
                                ? <polyline points="18 15 12 9 6 15"/>
                                : <polyline points="6 9 12 15 18 9"/>}
                            </svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginLeft: 3, verticalAlign: 'middle', opacity: 0.35 }}>
                              <polyline points="18 15 12 9 6 15"/>
                            </svg>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((file) => (
                      <tr key={file.id} className="queue-row">
                        <td>
                          <div className="queue-col-name">
                            <FileIcon />
                            {file.name}
                          </div>
                        </td>
                        <td className="queue-col-folder">{file.folder}</td>
                        <td className="queue-col-size">{file.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}

      </div>

      {/* ── Submission Context Modal (after upload) ── */}
      <SubmissionContext
        isOpen={contextOpen}
        onClose={() => { setContextOpen(false); setPendingUpload(null); }}
        onSubmit={(formData) => {
          if (pendingUpload) {
            const folder = formData.dataDomain || formData.projectName || 'Uncategorized';
            const tier = 'Tier 2: Internal Operational';
            const fileId = Date.now() + 1;
            const newBatch = {
              id: Date.now(),
              label: formatBatchDate(),
              files: [{
                id: fileId,
                name: pendingUpload.fileName,
                folder,
                status: 'Ready',
                tier,
                size: pendingUpload.fileSize ? formatBytes(pendingUpload.fileSize) : 'N/A',
                csvData: pendingCsvData && pendingCsvData.length > 0 ? pendingCsvData : (csvData && csvData.length > 0 ? csvData : null),
              }],
            };
            setBatches(prev => [newBatch, ...prev]);

            // Persist to MongoDB so Buffi's agent can query the data.
            if (pendingFile) {
              uploadSource(pendingFile, { folder, tier })
                .then((saved) => {
                  setDbSources(prev => [saved, ...prev]);
                  setBatches(prev => prev.map(b => b.id !== newBatch.id ? b : {
                    ...b,
                    files: b.files.map(f => f.id === fileId ? { ...f, sourceId: saved._id } : f),
                  }));
                })
                .catch((err) => {
                  setUploadError(`Saved locally, but database sync failed: ${err.message}`);
                });
            }
          }
          setContextOpen(false);
          setPendingUpload(null);
          setPendingCsvData(null);
          setPendingFile(null);
        }}
        fileName={pendingUpload?.fileName || ''}
      />

    </AppLayout>
  );
}
