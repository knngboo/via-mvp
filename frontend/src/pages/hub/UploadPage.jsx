import { useRef, useState, useEffect } from 'react';
import '../../styles/UploadPage.css';
import '../../styles/SubmissionsPage.css';
import { useCsv } from '../../context/CsvContext';
import AppLayout from '../../components/AppLayout';
import SubmissionContext from '../../context/SubmissionContext';
import apiService from '../../services/api';

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
  const { batches, setBatches, csvData, setCsvData, setFileName, setCsvStats, setColumnDescriptions } = useCsv();
  const [pendingCsvData, setPendingCsvData] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [dbSources, setDbSources] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  // Load sources persisted in PostgreSQL
  useEffect(() => {
    apiService.getSources()
      .then((data) => setDbSources(data || []))
      .catch(() => {});
  }, []);

  // Handle source deletion — calls the backend, then removes from UI
  const handleDelete = async (file) => {
    if (!file.sourceId) return; // local-only files (not yet synced) can't be deleted via API
    if (!window.confirm(`Delete "${file.name}"? This will permanently drop the data table.`)) return;
    setDeletingId(file.id);
    try {
      await apiService.deleteSource(file.sourceId);
      setDbSources(prev => prev.filter(s => s.id !== file.sourceId));
      setBatches(prev => prev.map(b => ({ ...b, files: b.files.filter(f => f.id !== file.id) })));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

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

  const localNames = new Set(batches.flatMap(b => b.files.map(f => f.name)));
  const dbFiles = dbSources
    .filter(s => !localNames.has(s.name))
    .map(s => ({
      id: `db-${s.id}`,
      sourceId: s.id,
      name: s.name,
      folder: s.data_domain || s.project_name || 'Uncategorized',
      status: s.status || 'Ready',
      tier: s.tier || 'Tier 2: Internal Operational',
      size: formatBytes(s.size),
      confidence: s.confidence || 'High',
      issue: '',
      csvData: [],
    }));
  const displayBatches = dbFiles.length > 0
    ? [...batches, { id: 'db-sources', label: 'Synced from Database', files: dbFiles }]
    : batches;

  const allFiles = displayBatches.flatMap(b => b.files).map(f => ({ ...f, hasError: f.status === 'Error' }));
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
      const result = await apiService.uploadCSV(file);
      // Backend returns { message, name, table, num_rows, size, ... } on success
      // No 'success' field — if it didn't throw, it succeeded.
      setFileName(result.name || file.name);
      setCsvData([]);
      setCsvStats(null);
      setPendingCsvData([]);
      setPendingFile(file);
      // Include the source database ID so the context PATCH can reference the right row
      setPendingUpload({ fileName: result.name || file.name, fileSize: file.size, _id: result._id });
      setContextOpen(true);
      // Refresh sources so the newly uploaded DB entry appears in the list
      apiService.getSources().then((data) => setDbSources(data || []));
    } catch (error) {
      setUploadError(error.message || 'Failed to upload CSV.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => handleFile(e.target.files[0]);

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
              <span className="storage-used">
                {dbSources.length > 0
                  ? (() => {
                      const totalBytes = dbSources.reduce((sum, s) => sum + (s.size || 0), 0);
                      if (totalBytes >= 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB Used`;
                      if (totalBytes >= 1024) return `${(totalBytes / 1024).toFixed(1)} KB Used`;
                      return `${totalBytes} B Used`;
                    })()
                  : '0 B Used'}
              </span>
            </div>
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
                        { label: 'Status',    col: 'status' },
                        { label: 'File Size', col: 'size' },
                      ].map(({ label, col }) => (
                        <th key={col} scope="col" onClick={() => handleColSort(batch.id, col)}>
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
                      <th scope="col" style={{ width: 60 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="queue-no-results" style={{ textAlign: 'center', padding: '16px' }}>
                          No files match the current folder filter.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((file) => (
                        <tr key={file.id} className="queue-row">
                          <td>
                            <div className="queue-col-name">
                              <FileIcon />
                              {file.name}
                            </div>
                          </td>
                          <td className="queue-col-folder">{file.folder}</td>
                          <td className="queue-col-status">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {file.status === 'Ready' && (
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
                              )}
                              {file.status === 'Error' && (
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
                              )}
                              {file.status}
                            </span>
                          </td>
                          <td className="queue-col-size">{file.size}</td>
                          <td style={{ textAlign: 'center' }}>
                            {file.sourceId && (
                              <button
                                title="Delete this source"
                                disabled={deletingId === file.id}
                                onClick={() => handleDelete(file)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: deletingId === file.id ? '#999' : '#CB2128',
                                  padding: '4px', borderRadius: '4px',
                                }}
                                aria-label={`Delete ${file.name}`}
                              >
                                {deletingId === file.id ? '…' : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    <path d="M10 11v6"/><path d="M14 11v6"/>
                                    <path d="M9 6V4h6v2"/>
                                  </svg>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
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
        onSubmit={async (formData) => {
          if (pendingUpload) {
            const folder = formData.dataDomain || formData.projectName || 'Uncategorized';
            const tier = 'Tier 2: Internal Operational';
            const fileId = Date.now() + 1;
            const tier = 'Tier 2: Internal Operational';
            const fileId = Date.now() + 1;
            const newBatch = {
              id: Date.now(),
              label: formatBatchDate(),
              files: [{
                id: fileId,
                id: fileId,
                name: pendingUpload.fileName,
                folder,
                status: 'Ready',
                tier,
                status: 'Ready',
                tier,
                size: pendingUpload.fileSize ? formatBytes(pendingUpload.fileSize) : 'N/A',
                csvData: pendingCsvData && pendingCsvData.length > 0 ? pendingCsvData : (csvData && csvData.length > 0 ? csvData : null),
              }],
            };
            setBatches(prev => [newBatch, ...prev]);

            // H-4 (P2-3): Persist submission context to the backend.
            // pendingUpload._id is the source ID returned from the upload endpoint.
            if (pendingUpload._id) {
              apiService.submitContext(pendingUpload._id, formData)
                .catch(err => console.error('Context save failed (non-blocking):', err));
            }

            // Re-fetch sources to make sure any backend metadata is updated
            apiService.getSources().then((data) => setDbSources(data || []));
          }
          setContextOpen(false);
          setPendingUpload(null);
          setPendingCsvData(null);
          setPendingFile(null);
          setPendingFile(null);
        }}
        fileName={pendingUpload?.fileName || ''}
      />

    </AppLayout>
  );
}
