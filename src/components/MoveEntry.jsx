import { useState } from 'react';

// Play a move by typing it, in SAN (e4, Nf3, exd5, O-O, e8=Q) or UCI (e2e4).
// `onSubmit` returns an error message, or null when the move was played.
export default function MoveEntry({ onSubmit, disabled, placeholder }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const problem = onSubmit(text);
    setError(problem);
    if (!problem) setText('');
  };

  return (
    <form className="move-entry" onSubmit={submit}>
      <label className="move-entry-row">
        <span className="sr-only">Type a move</span>
        <input
          className={`move-input${error ? ' invalid' : ''}`}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby="move-entry-error"
        />
        <button type="submit" className="btn btn-ghost" disabled={disabled || !text.trim()}>Play</button>
      </label>
      <p id="move-entry-error" className="move-entry-error" aria-live="polite">{error}</p>
    </form>
  );
}
