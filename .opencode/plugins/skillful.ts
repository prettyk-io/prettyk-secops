import { type Plugin, tool } from "@opencode-ai/plugin";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";

// Scan all SKILL.md files across global + project skill dirs
function discoverSkills(): Array<{
  id: string;
  name: string;
  description: string;
  basePath: string;
  skillDir: string;
}> {
  const dirs: string[] = [];
  const globalDir = join(homedir(), ".agents", "skills");
  const projectDir = join(process.cwd(), ".opencode", "skills");

  if (existsSync(globalDir)) dirs.push(globalDir);
  if (existsSync(projectDir)) dirs.push(projectDir);

  const results: ReturnType<typeof discoverSkills> = [];

  for (const basePath of dirs) {
    scanDir(basePath, basePath, results);
  }

  return results;
}

function scanDir(
  dir: string,
  basePath: string,
  results: ReturnType<typeof discoverSkills>
) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Check if this dir has SKILL.md
      const skillFile = join(full, "SKILL.md");
      if (existsSync(skillFile)) {
        try {
          const content = readFileSync(skillFile, "utf-8");
          const { name, description } = parseFrontmatter(
            content,
            e.name
          );
          results.push({
            id: e.name,
            name,
            description,
            basePath,
            skillDir: full,
          });
        } catch {
          // skip malformed
        }
      } else {
        scanDir(full, basePath, results);
      }
    }
  }
}

function parseFrontmatter(
  content: string,
  fallbackName: string
): { name: string; description: string } {
  // Try to extract first heading
  const h1 = content.match(/^#\s+(.+)/m);
  const name = h1 ? h1[1].trim() : fallbackName;
  // First non-empty line after name as description
  const lines = content.split("\n");
  let desc = "";
  let pastHeading = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      pastHeading = true;
      continue;
    }
    if (pastHeading && line.trim()) {
      desc = line.trim().slice(0, 120);
      break;
    }
  }
  return { name: name || fallbackName, description: desc };
}

export const SkillfulPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      skill_find: tool({
        description:
          "Search available skills by keyword. Call when you need to find a skill by topic or capability. " +
          'Use "*" to list all skills. Returns skill IDs, names, and descriptions.',
        args: {
          query: tool.schema
            .string()
            .optional()
            .describe(
              'Keywords to search. Use "*" or empty to list all. Supports multiple words (AND logic).'
            ),
        },
        async execute(args) {
          const all = discoverSkills();
          const q = (args.query || "").toLowerCase().trim();

          if (!q || q === "*") {
            const list = all
              .map(
                (s) =>
                  `skill_use "${s.id}"  —  ${s.name}  |  ${s.description || "—"}`
              )
              .join("\n");
            return `Found ${all.length} skills:\n\n${list}`;
          }

          const terms = q.split(/\s+/).filter(Boolean);
          const exclude = terms
            .filter((t) => t.startsWith("-"))
            .map((t) => t.slice(1));
          const include = terms.filter((t) => !t.startsWith("-"));

          const matched = all.filter((s) => {
            const haystack = `${s.id} ${s.name} ${s.description}`.toLowerCase();
            // Must match ALL include terms
            if (include.length > 0 && !include.every((t) => haystack.includes(t)))
              return false;
            // Must NOT match ANY exclude terms
            if (exclude.some((t) => haystack.includes(t))) return false;
            return true;
          });

          if (matched.length === 0) {
            return `No skills found for "${args.query}". Try \`skill_find "*"\` to see all ${all.length} skills.`;
          }

          const list = matched
            .map(
              (s) =>
                `skill_use "${s.id}"  —  ${s.name}  |  ${s.description || "—"}`
            )
            .join("\n");
          return `Found ${matched.length} skills:\n\n${list}`;
        },
      }),

      skill_resource: tool({
        description:
          "Read a specific reference file from a skill directory without loading the entire skill. " +
          "Use for templates, guides, scripts, or assets inside a skill. " +
          "Call after skill_use or skill_find when you need a specific resource.",
        args: {
          skill_name: tool.schema
            .string()
            .describe(
              "The skill ID (directory name) containing the resource"
            ),
          relative_path: tool.schema
            .string()
            .describe(
              "Path relative to the skill directory, e.g. 'references/guide.md' or 'scripts/setup.sh'"
            ),
        },
        async execute(args) {
          const all = discoverSkills();
          const skill = all.find(
            (s) =>
              s.id === args.skill_name ||
              s.id.toLowerCase() === args.skill_name.toLowerCase()
          );

          if (!skill) {
            return `ERROR: skill "${args.skill_name}" not found. Use skill_find to list available skills.`;
          }

          const fullPath = join(skill.skillDir, args.relative_path);

          // Security: path must be inside skill directory
          const resolved = relative(skill.skillDir, fullPath);
          if (resolved.startsWith("..") || fullPath.includes("..")) {
            return `ERROR: path traversal blocked. Resource must be inside "${skill.id}/".`;
          }

          if (!existsSync(fullPath)) {
            return `ERROR: resource "${args.relative_path}" not found in skill "${args.skill_name}".`;
          }

          try {
            const content = readFileSync(fullPath, "utf-8");
            const ext = fullPath.split(".").pop() || "";
            const mimeMap: Record<string, string> = {
              md: "text/markdown",
              ts: "text/typescript",
              tsx: "text/typescript",
              js: "text/javascript",
              json: "application/json",
              yml: "text/yaml",
              yaml: "text/yaml",
              html: "text/html",
              css: "text/css",
              sh: "text/plain",
              ps1: "text/plain",
              txt: "text/plain",
              py: "text/python",
            };
            const mime = mimeMap[ext] || "text/plain";

            return [
              `## ${args.skill_name} / ${args.relative_path}`,
              `_type: ${mime}_`,
              "",
              content,
            ].join("\n");
          } catch (e: any) {
            return `ERROR: cannot read "${fullPath}": ${e.message}`;
          }
        },
      }),
    },
  };
};