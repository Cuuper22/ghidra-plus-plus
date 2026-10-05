import { Icon } from "./Icon";

const words: [string, string][] = [
  ["Function", "A small piece of a program that does one job, such as checking a password or adding up numbers."],
  ["Address", "Where a function sits inside the program, written in hexadecimal (base 16). Ghidra uses it as the function's ID."],
  ["Rebuilt code", "C code that Ghidra reconstructs from the machine code. It shows what the program does, but the original names and comments are gone."],
  ["Connections", "Which functions use which. When one function uses another, programmers say it calls it."],
  ["Description and suggested name", "TypeSafe reads a short excerpt of the rebuilt code and picks the job that fits best. When one of the names it knows fits, it suggests that name too. You decide whether to use it, and Undo puts the old name back."],
  ["Save", "Keeps your names in a Ghidra project on this computer. Open the same file again later to carry on."],
  ["Full Ghidra", "The classic Ghidra window, for deeper work on the same program. A rename in either window shows up in the other."],
];

export function HelpDialog({
  showTips,
  onTips,
  onClose,
}: {
  showTips: boolean;
  onTips: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <div className="dialog-heading">
          <h2 id="help-title">How Ghidra++ works</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close help"
          >
            <Icon name="close" />
          </button>
        </div>
        <p>
          Ghidra++ helps you understand a compiled program, the kind of file you
          double-click to run, without running it. Pick a function, read what it
          does, and give it a name that makes sense to you.
        </p>
        <dl className="glossary">
          {words.map(([term, meaning]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showTips}
            onChange={(event) => onTips(event.target.checked)}
          />
          Show tips in the workspace
        </label>
        <a
          className="link-button"
          href="https://github.com/Cuuper22/ghidra-plus-plus/blob/master/docs/getting-started.md"
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="external" /> Read the full guide
        </a>
      </div>
    </div>
  );
}
