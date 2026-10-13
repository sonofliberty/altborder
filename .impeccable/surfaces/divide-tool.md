---
version: 1
slug: "divide-tool"
primary_target: "src/EditorSidePanel.tsx"
related_targets: ["src/App.tsx", "src/styles.css", "src/types.ts"]
---

# Divide tool

Mode: Operate. Scope: divide interaction and its guidance. Preserve the existing dark editor, gold actions, map appearance, geometry operations, history, and shared-link format.

Delight thesis: Users should feel in control of a new border because each point and side choice is visible before they create a country.

Default to a two-point cut with a live dashed line and endpoint marks. Keep freehand, island, and keyboard cuts available. Explain the current step on the map and in the panel. A completed preview lets users choose a side without replacing the cut. Use the existing creation feedback and Undo. Use no new image assets or decorative motion.

Keep untouched subdivisions. Transfer whole subdivisions with their original IDs. Split only intersected subdivisions, keeping their names and local borders. Verify creation, undo, redo, repeated cuts, and shared-link restoration.
