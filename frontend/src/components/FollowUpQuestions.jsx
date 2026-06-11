import { useState } from 'react';
import '../styles/FollowUpQuestions.css';
import { OTHER_VALUE } from '../services/openai';

// Claude-Code-style follow-up, shown one question at a time as a focused
// takeover of the chat area. Picking a single-select option advances to the
// next question automatically; a Back button lets you revisit earlier answers.
// Every answer is sent back together as a single message.
export default function FollowUpQuestions({ questions, onSubmit }) {
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState(() => questions.map(() => new Set()));
  const [otherText, setOtherText] = useState(() => questions.map(() => ''));
  const [submitted, setSubmitted] = useState(false);

  const total = questions.length;
  const q = questions[step];
  const set = selections[step];
  const isLast = step === total - 1;

  const isAnswered = (qi) => {
    const s = selections[qi];
    if (s.size === 0) return false;
    if (s.has(OTHER_VALUE) && !otherText[qi].trim()) return false;
    return true;
  };
  const curAnswered = isAnswered(step);

  const goNext = () => setStep((s) => Math.min(total - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const choose = (value) => {
    if (submitted) return;
    const had = set.has(value);
    setSelections((prev) => {
      const next = prev.map((s) => new Set(s));
      const s = next[step];
      if (q.multiSelect) {
        // Multi-select: toggle this option on/off.
        if (had) s.delete(value);
        else s.add(value);
      } else {
        // Single-select: the clicked option becomes the sole choice (never
        // toggles off — radios stay chosen).
        s.clear();
        s.add(value);
      }
      return next;
    });
    // Single-select: jump straight to the next question, but pause on "Other…"
    // so the user can type their answer first.
    if (!q.multiSelect && value !== OTHER_VALUE && !isLast) goNext();
  };

  const updateOther = (text) => {
    setOtherText((prev) => {
      const next = [...prev];
      next[step] = text;
      return next;
    });
  };

  const submit = () => {
    if (submitted || !questions.every((_, qi) => isAnswered(qi))) return;
    const lines = questions.map((qq, qi) => {
      const s = selections[qi];
      const answers = qq.options.filter((o) => s.has(o.label)).map((o) => o.label);
      if (s.has(OTHER_VALUE) && otherText[qi].trim()) answers.push(otherText[qi].trim());
      return `${qq.header || qq.question}: ${answers.join(', ')}`;
    });
    setSubmitted(true);
    onSubmit(lines.join('\n'));
  };

  const handlePrimary = () => {
    if (!curAnswered) return;
    if (isLast) submit();
    else goNext();
  };

  return (
    <div className="followup-stepper">
      <div className="followup-stepper-inner">
        <div className="followup-head">
          <span className="followup-badge">Follow-up</span>
          <span className="followup-progress">Question {step + 1} of {total}</span>
        </div>

        <div className="followup-progress-track">
          {questions.map((_, i) => (
            <span
              key={i}
              className={
                'followup-progress-seg' +
                (i < step ? ' followup-progress-seg--done' : '') +
                (i === step ? ' followup-progress-seg--active' : '')
              }
            />
          ))}
        </div>

        <div className="followup-question">
          <div className="followup-q-meta">
            <span className="followup-q-chip">{q.header || `Q${step + 1}`}</span>
            {q.multiSelect && <span className="followup-q-multi">choose any</span>}
          </div>
          <div className="followup-q-text">{q.question}</div>

          <div className="followup-options">
            {q.options.map((opt, oi) => {
              const selected = set.has(opt.label);
              return (
                <button
                  type="button"
                  key={oi}
                  className={`followup-option${selected ? ' followup-option--selected' : ''}`}
                  onClick={() => choose(opt.label)}
                  disabled={submitted}
                >
                  <span className={`followup-marker${q.multiSelect ? ' followup-marker--box' : ''}`} />
                  <span className="followup-option-body">
                    <span className="followup-option-label">{opt.label}</span>
                    {opt.description && (
                      <span className="followup-option-desc">{opt.description}</span>
                    )}
                  </span>
                </button>
              );
            })}

            {/* Always-available free-text choice */}
            <button
              type="button"
              className={`followup-option${set.has(OTHER_VALUE) ? ' followup-option--selected' : ''}`}
              onClick={() => choose(OTHER_VALUE)}
              disabled={submitted}
            >
              <span className={`followup-marker${q.multiSelect ? ' followup-marker--box' : ''}`} />
              <span className="followup-option-body">
                <span className="followup-option-label">Other…</span>
              </span>
            </button>

            {set.has(OTHER_VALUE) && (
              <input
                type="text"
                className="followup-other-input"
                placeholder="Type your answer"
                value={otherText[step]}
                onChange={(e) => updateOther(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePrimary();
                  }
                }}
                disabled={submitted}
                autoFocus
              />
            )}
          </div>
        </div>

        <div className="followup-footer">
          <button
            type="button"
            className="followup-back"
            onClick={goBack}
            disabled={step === 0 || submitted}
          >
            Back
          </button>
          <button
            type="button"
            className="followup-send"
            onClick={handlePrimary}
            disabled={!curAnswered || submitted}
          >
            {isLast ? (submitted ? 'Sent' : 'Send answers') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
