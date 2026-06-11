import { useCsv } from '../../context/CsvContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/CSVEditor.css';
import downloadLogo from "../../assets/images/iconoir_download.svg"
import infoIcon from "../../assets/images/Icon=info-circle.svg";
import transferIcon from "../../assets/images/Icon=data-transfer-both.svg";
import sparkIcon from "../../assets/images/Icon=spark.svg"

const headerDescriptions = {
  street: 'The street name or location info.',
  age: 'Age in years.',
  email: 'User email address.',
  // Add more headers and their descriptions here as needed
};

export default function CSVPreview() {
  const navigate = useNavigate();
  const { csvData, fileName, columnDescriptions } = useCsv();
  const [visibleHeader, setVisibleHeader] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!csvData || csvData.length === 0) {
    return <div className="preview-table">No data to display.</div>;
  }

  const headers = Object.keys(csvData[0]);

  const handleDownload = () => {
    setIsDownloading(true);
    try {
      const headers = Object.keys(csvData[0] || {});
      const escape = (v) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const lines = [
        headers.join(','),
        ...csvData.map((row) => headers.map((h) => escape(row[h])).join(',')),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'processed_data.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

return (
    <div>
        <div className="preview-table">
            <table>
            <thead>
                <tr>
                {headers.map((header) => (
                    <th key={header} className="header-cell">
                    <div className="header-top">
                        <span className="header-label">{header}</span>
                        <span
                        className="question-icon"
                        onClick={() =>
                            setVisibleHeader(visibleHeader === header ? null : header)
                        }
                        title="Show description"
                        >
                        {/* <img src={ transferIcon } alt="||" /> */}
                        <img src={ infoIcon } alt="❓" />
                        </span>
                    </div>
                    {visibleHeader === header && (
                        <div className="header-description">
                        {columnDescriptions[header] || headerDescriptions[header] || <p><img src={ sparkIcon } alt="*" className="spark-icon" /> No description available.</p>}
                        </div>
                    )}
                    </th>
                ))}
                </tr>
            </thead>
            <tbody>
                {csvData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                    {headers.map((header) => (
                    <td key={header}>{row[header]}</td>
                    ))}
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        <div className="buttons">
            <button 
              onClick={handleDownload} 
              className='button-base download-btn'
              disabled={isDownloading}
            >
              <img src={downloadLogo} alt="Download Logo"/>
              {isDownloading ? 'Downloading...' : ''}
            </button>
            <button className='button-base back-btn' onClick={() => navigate('/upload')}>Back</button>
            <button className='button-base next-btn' onClick={() => navigate('/success')}>Finalize</button>
        </div>
    </div>
    );
}
