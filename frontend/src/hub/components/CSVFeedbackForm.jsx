import { useState } from 'react';
import '../styles/CSVFeedbackForm.css'

const CSVFeedbackForm = () => {
  const [formData, setFormData] = useState({
    purpose: '',
    stakeholders: '',
    incorrectFields: '',
    terminology: '',
    additionalContext: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage('');
    
    try {
      const reports = JSON.parse(localStorage.getItem('buffi_csv_feedback') || '[]');
      reports.push({ ...formData, timestamp: Date.now() });
      localStorage.setItem('buffi_csv_feedback', JSON.stringify(reports));
      setSubmitMessage('Feedback saved locally. Thank you.');
      setFormData({
        purpose: '',
        stakeholders: '',
        incorrectFields: '',
        terminology: '',
        additionalContext: ''
      });
    } catch (error) {
      console.error('Feedback save error:', error);
      setSubmitMessage('Failed to save feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="csv-feedback-form" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Feedback Regarding the CSV</legend>
        <label>
          <p>What was the original purpose of this CSV file?</p>
          <textarea name="purpose" value={formData.purpose} onChange={handleChange} />
        </label>
        <label>
          <p>Who relies on this data internally or externally?</p>
          <textarea name="stakeholders" value={formData.stakeholders} onChange={handleChange} />
        </label>
        <label>
          <p>Were any fields handled incorrectly?</p>
          <textarea name="incorrectFields" value={formData.incorrectFields} onChange={handleChange} />
        </label>
        <label>
          <p>Any terms, cells, or headers that need clarification?</p>
          <textarea name="terminology" value={formData.terminology} onChange={handleChange} />
        </label>
        <label>
          <p>Any other files, rules, comments or context we should consider?</p>
          <textarea name="additionalContext" value={formData.additionalContext} onChange={handleChange} />
        </label>
      </fieldset>

      {submitMessage && (
        <div className={`submit-message ${submitMessage.includes('successfully') ? 'success' : 'error'}`}>
          {submitMessage}
        </div>
      )}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </form>
  );
};

export default CSVFeedbackForm;
