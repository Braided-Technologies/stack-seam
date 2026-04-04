

## Fix Article Rendering: Tables + First Section Open

### Problems
1. **Markdown tables render as raw text** — `react-markdown` requires the `remark-gfm` plugin to parse GitHub Flavored Markdown (tables, strikethrough, autolinks). It is not installed.
2. **Everything is collapsed** — The first `##` section should be expanded by default so readers see content immediately. Only subsequent sections should collapse.

### Plan

**1. Install `remark-gfm`**
- Add `remark-gfm` as a dependency.

**2. Update `ArticleRenderer.tsx`**
- Import `remarkGfm` and pass it to all `<ReactMarkdown>` instances via `remarkPlugins={[remarkGfm]}`.
- Change `defaultOpen` logic: the first section (`i === 0`) is always open by default, not just when there's only one section.
- Add custom table component overrides to ensure proper styling (bordered cells, alternating rows) since the prose classes alone may not be sufficient in dark mode.

**3. Files changed**
- `package.json` — add `remark-gfm`
- `src/components/ArticleRenderer.tsx` — add remarkGfm plugin, fix first-section-open logic, improve table rendering

