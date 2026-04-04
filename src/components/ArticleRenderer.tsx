import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Section {
  heading: string;
  content: string;
}

function parseArticle(markdown: string): { intro: string; sections: Section[] } {
  const lines = markdown.split('\n');
  let intro = '';
  const sections: Section[] = [];
  let currentHeading = '';
  let currentContent = '';
  let foundFirstSection = false;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      if (foundFirstSection) {
        sections.push({ heading: currentHeading, content: currentContent.trim() });
      }
      currentHeading = h2Match[1];
      currentContent = '';
      foundFirstSection = true;
    } else if (!foundFirstSection) {
      intro += line + '\n';
    } else {
      currentContent += line + '\n';
    }
  }

  if (foundFirstSection) {
    sections.push({ heading: currentHeading, content: currentContent.trim() });
  }

  // Strip leading h1 from intro
  intro = intro.replace(/^# .+\n+/, '').trim();

  return { intro, sections };
}

const markdownClasses = `prose prose-sm dark:prose-invert max-w-none 
  prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
  prose-h4:text-sm prose-h4:font-medium prose-h4:mt-3 prose-h4:mb-1
  prose-table:border prose-table:border-border prose-table:rounded-md prose-table:text-sm
  prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-medium
  prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-td:border-t prose-td:border-border
  prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-md prose-blockquote:not-italic prose-blockquote:text-sm
  prose-li:marker:text-primary prose-li:text-sm
  prose-strong:text-foreground
  prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
  prose-p:text-sm prose-p:leading-relaxed
  prose-a:text-primary prose-a:underline prose-a:font-medium`;

function CollapsibleSection({ heading, content, defaultOpen = false }: Section & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-accent/50 transition-colors group"
      >
        <h2 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {heading}
        </h2>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className={cn('px-5 pb-5 pt-1', markdownClasses)}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default function ArticleRenderer({ content }: { content: string }) {
  const { intro, sections } = parseArticle(content);
  const [allExpanded, setAllExpanded] = useState(false);
  const [key, setKey] = useState(0);

  const toggleAll = () => {
    setAllExpanded(!allExpanded);
    setKey(k => k + 1);
  };

  return (
    <div className="space-y-5">
      {/* Intro text (above all sections) */}
      {intro && (
        <div className={markdownClasses}>
          <ReactMarkdown>{intro}</ReactMarkdown>
        </div>
      )}

      {/* Expand/Collapse all toggle */}
      {sections.length > 1 && (
        <button
          onClick={toggleAll}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', allExpanded && 'rotate-180')} />
        </button>
      )}

      {/* Collapsible sections */}
      <div className="space-y-2" key={key}>
        {sections.map((section, i) => (
          <CollapsibleSection
            key={i}
            heading={section.heading}
            content={section.content}
            defaultOpen={sections.length === 1 || allExpanded}
          />
        ))}
      </div>
    </div>
  );
}
