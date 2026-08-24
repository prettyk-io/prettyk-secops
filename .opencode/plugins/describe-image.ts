import { type Plugin, tool } from "@opencode-ai/plugin";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Read OpenRouter API key from OpenCode auth storage (same place `/connect` saves it)
function readOpenRouterKey(): string {
  const envKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (envKey) return envKey;

  try {
    const authPath = path.join(
      homedir(),
      ".local",
      "share",
      "opencode",
      "auth.json"
    );
    const raw = readFileSync(authPath, "utf-8");
    const auth = JSON.parse(raw);
    return auth?.openrouter?.key || "";
  } catch {
    return "";
  }
}

export const DescribeImagePlugin: Plugin = async (ctx) => {
  const { directory } = ctx;

  return {
    tool: {
      describe_image: tool({
        description:
          "Describe the contents of an image file (PNG, JPG, GIF, WebP) using Gemini vision via OpenRouter. " +
          "Call this tool when you need to understand what is shown in a screenshot, diagram, UI mockup, or any image. " +
          "Returns a detailed text description that you can use for further work.",
        args: {
          filePath: tool.schema
            .string()
            .describe("Absolute path to the image file"),
          detail: tool.schema
            .string()
            .optional()
            .describe(
              "What to focus on: 'ui' (UI elements, layout, styling), 'code' (code in screenshot), 'diagram' (architecture/flow), 'general' (default)"
            ),
        },
        async execute(args, toolCtx) {
          const absPath = path.isAbsolute(args.filePath)
            ? args.filePath
            : path.join(directory, args.filePath);

          const ext = path.extname(absPath).toLowerCase();
          const mimeMap: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
          };
          const mime = mimeMap[ext];
          if (!mime) {
            return `ERROR: unsupported image format "${ext}". Supported: PNG, JPG, GIF, WebP.`;
          }

          let base64: string;
          try {
            const buf = readFileSync(absPath);
            base64 = buf.toString("base64");
          } catch {
            return `ERROR: cannot read file "${absPath}". Check path and permissions.`;
          }

          const focusMap: Record<string, string> = {
            ui: "Describe the user interface in detail: layout structure, components visible, styling (colors, spacing, typography), and any interactive elements. Focus on what a developer or designer would need to know.",
            code: "Read every line of code visible in the screenshot. Describe the code structure, variables, functions, and any errors or diagnostics shown.",
            diagram:
              "Describe the diagram or flowchart: nodes, connections, labels, overall structure and meaning.",
            general:
              "Describe everything visible in this image in clear, structured detail.",
          };
          const focus = focusMap[args.detail || "general"] || focusMap.general;

          const apiKey = readOpenRouterKey();
          if (!apiKey) {
            return (
              "ERROR: no API key available. Run `/connect` in OpenCode to add an OpenRouter key, " +
              "or set OPENROUTER_API_KEY in your environment.\n\n" +
              "Without vision, here is what I can tell: " +
              `path="${absPath}", mime="${mime}", size=${base64.length} base64 chars.`
            );
          }

          // Use OpenRouter to call Gemini (reuses existing key)
          const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: focus },
                      {
                        type: "image_url",
                        image_url: { url: `data:${mime};base64,${base64}` },
                      },
                    ],
                  },
                ],
                max_tokens: 1024,
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            return `ERROR: Gemini vision call failed (${response.status} ${response.statusText}). ${errText}`;
          }

          const body = await response.json();
          const text = body?.choices?.[0]?.message?.content;
          if (text) return text;

          return `ERROR: Gemini returned no text content. Response: ${JSON.stringify(body).slice(0, 500)}`;
        },
      }),
    },
  };
};