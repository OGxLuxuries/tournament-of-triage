import { Fragment, type ReactNode } from "react";

/**
 * Micro-renderer for the Smart Agent's Markdown (headings, bold, inline
 * code, tables, list items). We generate that Markdown ourselves, so this
 * intentionally supports only that dialect — everything renders as React
 * nodes, never innerHTML, so player names can't inject markup.
 */

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="text-neon-yellow">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="bg-abyss-700 px-1 text-neon-cyan">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let tableRows: string[][] = [];

  const flushTable = (key: number) => {
    if (tableRows.length === 0) return;
    const [head, ...body] = tableRows;
    blocks.push(
      <div key={`table-${key}`} className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i} className="border border-abyss-600 bg-abyss-800 px-2 py-1 font-arcade text-[9px] text-neon-magenta">
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-abyss-600 px-2 py-1">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      const cells = trimmed
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      if (!cells.every((cell) => /^-{3,}$/.test(cell))) tableRows.push(cells);
      return;
    }
    flushTable(index);
    if (trimmed === "" || trimmed === "---") return;
    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h4 key={index} className="font-arcade text-[10px] leading-relaxed text-neon-green">
          {renderInline(trimmed.slice(4))}
        </h4>,
      );
    } else if (trimmed.startsWith("- ")) {
      blocks.push(
        <p key={index} className="pl-3 text-xs leading-relaxed">
          ▸ {renderInline(trimmed.slice(2))}
        </p>,
      );
    } else if (trimmed.startsWith("⚠️") || trimmed.startsWith("**")) {
      blocks.push(
        <p key={index} className="text-xs leading-relaxed">
          {renderInline(trimmed)}
        </p>,
      );
    } else {
      blocks.push(
        <p key={index} className="text-xs leading-relaxed">
          {renderInline(trimmed)}
        </p>,
      );
    }
  });
  flushTable(lines.length);

  return <div className="flex flex-col gap-2">{blocks}</div>;
}
