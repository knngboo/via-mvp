import { useState } from 'react';
import '../styles/SubmissionContext.css';

const DOMAIN_PRESETS = [
  'VIA Transit',
  'Ridership',
  'Routes & Schedules',
  'Operations',
  'Safety',
  'Infrastructure',
  'Finance',
  'Demographics',
];

const AGENCY_OPTIONS = [
  { value: 'accept', label: 'Accept suggested classification' },
  { value: 'reject', label: 'Reject suggested classification' },
  { value: 'manual', label: 'Request manual review' },
];

// Small ℹ circle shown next to field labels.
// Shows tooltip text on hover via the title attribute.
const HelpTip = ({ text }) => (
  <span
    title={text}
    aria-label={text}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 15, height: 15, borderRadius: '50%',
      background: '#e5e7eb', color: '#6b7280',
      fontSize: 10, fontWeight: 700, lineHeight: 1,
      marginLeft: 6, cursor: 'help', flexShrink: 0,
      verticalAlign: 'middle', userSelect: 'none',
    }}
  >
    ?
  </span>
);

export default function SubmissionContext({ isOpen, onClose, onSubmit, fileName }) {
  const [step, setStep] = useState(1);
  const [step1Error, setStep1Error] = useState('');
  const [customDomain, setCustomDomain] = useState(false);
  const [form, setForm] = useState({
    projectName: '',
    description: '',
    dataDomain: '',
    coverageStart: '',
    coverageEnd: '',
    ongoing: false,
    agencyResponse: 'accept',
    permissionAck: false,
  });

  if (!isOpen) return null;

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleDomainChange = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setCustomDomain(true);
      set('dataDomain', '');
    } else {
      setCustomDomain(false);
      set('dataDomain', val);
    }
  };

  // Step 1 validation: project name is required before proceeding
  const handleNext = () => {
    if (!form.projectName.trim()) {
      setStep1Error('Project Name is required.');
      return;
    }
    setStep1Error('');
    setStep(2);
  };

  const handleSubmit = () => onSubmit(form);

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={e => e.stopPropagation()}>

        {/* Title */}
        <h2 className="sc-title">
          {step === 1 ? 'Submission Context' : 'AI/ML Training Intent'}
        </h2>

        {/* Step indicator */}
        <div className="sc-steps">
          <div className={`sc-step ${step === 1 ? 'active' : 'done'}`}>
            <div className="sc-step-dot">
              {step > 1 && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <span className="sc-step-label">Submission Context</span>
          </div>
          <div className="sc-step-line" />
          <div className={`sc-step ${step === 2 ? 'active' : step > 2 ? 'done' : 'inactive'}`}>
            <div className="sc-step-dot" />
            <span className="sc-step-label">
              {step === 1 ? 'AI/ML Training Intent' : 'Classification'}
            </span>
          </div>
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="sc-body">

            {/* Project Name */}
            <div className="sc-field">
              <label className="sc-label">
                Project Name
                <HelpTip text="Give this upload a memorable name so you can find it later. Example: 'Transit Routes 2018' or 'Q3 Ridership Data'" />
              </label>
              <input
                className="sc-input"
                placeholder="e.g. Transit Routes 2018"
                value={form.projectName}
                onChange={e => set('projectName', e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="sc-field">
              <label className="sc-label">
                Submission Description
                <HelpTip text="Optional. Briefly describe what this file contains — what kind of data, any known limitations, or how it was collected." />
              </label>
              <textarea
                className="sc-textarea"
                placeholder="e.g. Bus route shapefiles exported from GIS for fiscal year 2018"
                rows={3}
                value={form.description}
                onChange={e => set('description', e.target.value)}
              />
            </div>

            {/* Data Domain — dropdown + custom option */}
            <div className="sc-field">
              <label className="sc-label">
                Data Domain
                <HelpTip text="The category this data belongs to. This becomes the 'Folder' label in the Data Hub. Pick from the list or choose 'Other' to type your own." />
              </label>
              <div className="sc-select-wrap">
                <select
                  className="sc-select"
                  value={customDomain ? '__custom__' : (form.dataDomain || '')}
                  onChange={handleDomainChange}
                >
                  <option value="">— Select a domain —</option>
                  {DOMAIN_PRESETS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  <option value="__custom__">Other (type your own)</option>
                </select>
                <svg className="sc-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {customDomain && (
                <input
                  className="sc-input"
                  style={{ marginTop: 8 }}
                  placeholder="Type your domain name..."
                  value={form.dataDomain}
                  onChange={e => set('dataDomain', e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {/* Temporal Coverage */}
            <div className="sc-dates">
              <div className="sc-field">
                <label className="sc-label">
                  Coverage Start
                  <HelpTip text="The earliest date this data covers. Leave blank if unknown." />
                </label>
                <div className="sc-date-wrap">
                  <input
                    className="sc-input"
                    type="date"
                    value={form.coverageStart}
                    onChange={e => set('coverageStart', e.target.value)}
                  />
                  <svg className="sc-date-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
              <div className="sc-field">
                <label className="sc-label">
                  End Date
                  <HelpTip text="The most recent date this data covers. Leave blank if the data is ongoing or if end date is unknown." />
                </label>
                <div className="sc-date-wrap">
                  <input
                    className="sc-input"
                    type="date"
                    value={form.coverageEnd}
                    onChange={e => set('coverageEnd', e.target.value)}
                  />
                  <svg className="sc-date-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
            </div>

            <label className="sc-checkbox-label">
              <input
                type="checkbox"
                className="sc-checkbox"
                checked={form.ongoing}
                onChange={e => set('ongoing', e.target.checked)}
              />
              <span>Ongoing / continuously updated</span>
            </label>

            {step1Error && (
              <p role="alert" style={{ color: '#CB2128', fontSize: '13px', margin: '-4px 0 8px', fontWeight: 500 }}>
                {step1Error}
              </p>
            )}

            <button className="sc-next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="sc-body">
            <div className="sc-field">
              <label className="sc-label">
                Agency Response
                <HelpTip text="Choose how to handle the AI's suggested data classification. 'Accept' uses the default Tier 2 label. 'Reject' flags it for reassignment. 'Manual review' escalates to a data admin." />
              </label>
              <div className="sc-select-wrap">
                <select
                  className="sc-select"
                  value={form.agencyResponse}
                  onChange={e => set('agencyResponse', e.target.value)}
                >
                  {AGENCY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <svg className="sc-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            <div className="sc-classification-card">
              <p className="sc-classification-title">
                Suggested Classification: Tier 2 — Internal Operational
              </p>
              <p className="sc-classification-desc">
                Default classification applied to all uploads. AI-driven classification (based on column names and data content) is a planned future feature — for now all files receive Tier 2. Use the dropdown above to flag for manual review if this file needs a different tier.
              </p>
            </div>

            <div className="sc-field">
              <label className="sc-label">
                Permissions Acknowledgement
                <HelpTip text="Check this box to confirm you have the right to upload this data and consent to it being used for AI model training within the platform." />
              </label>
              <label className="sc-checkbox-label sc-ack-row">
                <input
                  type="checkbox"
                  className="sc-checkbox"
                  checked={form.permissionAck}
                  onChange={e => set('permissionAck', e.target.checked)}
                />
                <span>VIA may use this dataset for AI or machine learning model training.</span>
              </label>
            </div>

            <div className="sc-step2-actions">
              <button className="sc-back-btn" onClick={() => setStep(1)}>Back</button>
              <button
                className="sc-submit-btn"
                onClick={handleSubmit}
                disabled={!form.permissionAck}
                title={!form.permissionAck ? 'You must acknowledge the permissions statement to submit.' : ''}
                style={{ opacity: form.permissionAck ? 1 : 0.5, cursor: form.permissionAck ? 'pointer' : 'not-allowed' }}
              >
                Submit
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
