import { type Plugin, tool } from "@opencode-ai/plugin";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

function applyFilePatch(filePath: string, patchLines: string[]): { ok: boolean; message: string } {
  try {
    const parentDir = path.dirname(filePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    if (!existsSync(filePath)) {
      // If file doesn't exist, treat as full new file creation
      const content = patchLines
        .filter((l) => !l.startsWith("@@") && !l.startsWith("***"))
        .map((l) => (l.startsWith("+") ? l.slice(1) : l))
        .join("\n");
      writeFileSync(filePath, content, "utf-8");
      return { ok: true, message: `Created new file ${filePath}` };
    }

    const originalContent = readFileSync(filePath, "utf-8");
    const originalLines = originalContent.split(/\r?\n/);
    let modifiedLines = [...originalLines];

    // Simple hunk applier
    let i = 0;
    while (i < patchLines.length) {
      const line = patchLines[i];
      if (line.startsWith("@@")) {
        i++;
        continue;
      }

      // Collect block of removals and additions
      if (line.startsWith("-") || line.startsWith("+") || line.startsWith(" ")) {
        const removals: string[] = [];
        const additions: string[] = [];
        const contextBefore: string[] = [];

        while (i < patchLines.length && !patchLines[i].startsWith("@@") && !patchLines[i].startsWith("***")) {
          const cur = patchLines[i];
          if (cur.startsWith("-")) {
            removals.push(cur.slice(1));
          } else if (cur.startsWith("+")) {
            additions.push(cur.slice(1));
          } else if (cur.startsWith(" ")) {
            if (removals.length === 0 && additions.length === 0) {
              contextBefore.push(cur.slice(1));
            } else {
              break;
            }
          }
          i++;
        }

        if (removals.length > 0) {
          const searchStr = removals.join("\n");
          const curContent = modifiedLines.join("\n");
          const idx = curContent.indexOf(searchStr);
          if (idx !== -1) {
            const before = curContent.slice(0, idx);
            const after = curContent.slice(idx + searchStr.length);
            const nextContent = before + additions.join("\n") + after;
            modifiedLines = nextContent.split("\n");
          } else {
            // Fallback: line by line replacement
            for (const rem of removals) {
              const lineIdx = modifiedLines.findIndex((l) => l.trim() === rem.trim());
              if (lineIdx !== -1) {
                modifiedLines.splice(lineIdx, 1, ...additions);
                break;
              }
            }
          }
        } else if (additions.length > 0 && contextBefore.length > 0) {
          const anchor = contextBefore[contextBefore.length - 1];
          const lineIdx = modifiedLines.findIndex((l) => l.trim() === anchor.trim());
          if (lineIdx !== -1) {
            modifiedLines.splice(lineIdx + 1, 0, ...additions);
          } else {
            modifiedLines.push(...additions);
          }
        }
      } else {
        i++;
      }
    }

    writeFileSync(filePath, modifiedLines.join("\n"), "utf-8");
    return { ok: true, message: `Updated ${filePath}` };
  } catch (err: any) {
    return { ok: false, message: `Failed to patch ${filePath}: ${err?.message || String(err)}` };
  }
}

export const ApplyPatchPlugin: Plugin = async (ctx) => {
  const { directory } = ctx;

  return {
    tool: {
      apply_patch: tool({
        description:
          "Apply a patch containing file additions, updates, or deletions formatted with '*** Begin Patch ... *** End Patch' or unified diffs.",
        args: {
          patchText: tool.schema.string().describe("The patch content to apply"),
        },
        async execute(args) {
          const text = args.patchText || "";
          const lines = text.split(/\r?\n/);
          const results: string[] = [];

          let currentAction: "add" | "update" | "delete" | null = null;
          let currentFilePath: string | null = null;
          let currentPatchLines: string[] = [];

          const flushCurrent = () => {
            if (!currentFilePath) return;
            const targetPath = path.isAbsolute(currentFilePath)
              ? currentFilePath
              : path.join(directory, currentFilePath);

            if (currentAction === "delete") {
              try {
                if (existsSync(targetPath)) {
                  unlinkSync(targetPath);
                  results.push(`Deleted ${targetPath}`);
                } else {
                  results.push(`File ${targetPath} already absent`);
                }
              } catch (e: any) {
                results.push(`Failed to delete ${targetPath}: ${e.message}`);
              }
            } else if (currentAction === "add") {
              try {
                const parent = path.dirname(targetPath);
                if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
                const content = currentPatchLines
                  .map((l) => (l.startsWith("+") ? l.slice(1) : l))
                  .join("\n");
                writeFileSync(targetPath, content, "utf-8");
                results.push(`Added ${targetPath}`);
              } catch (e: any) {
                results.push(`Failed to add ${targetPath}: ${e.message}`);
              }
            } else if (currentAction === "update") {
              const res = applyFilePatch(targetPath, currentPatchLines);
              results.push(res.message);
            }

            currentAction = null;
            currentFilePath = null;
            currentPatchLines = [];
          };

          for (const line of lines) {
            if (line.startsWith("*** Add File:")) {
              flushCurrent();
              currentAction = "add";
              currentFilePath = line.replace("*** Add File:", "").trim();
            } else if (line.startsWith("*** Update File:")) {
              flushCurrent();
              currentAction = "update";
              currentFilePath = line.replace("*** Update File:", "").trim();
            } else if (line.startsWith("*** Delete File:")) {
              flushCurrent();
              currentAction = "delete";
              currentFilePath = line.replace("*** Delete File:", "").trim();
            } else if (line.startsWith("*** Begin Patch") || line.startsWith("*** End Patch")) {
              // ignore delimiter
            } else {
              currentPatchLines.push(line);
            }
          }

          flushCurrent();

          if (results.length === 0) {
            return "No file actions were recognized in patchText.";
          }

          return `Patch applied successfully:\n${results.join("\n")}`;
        },
      }),
    },
  };
};
