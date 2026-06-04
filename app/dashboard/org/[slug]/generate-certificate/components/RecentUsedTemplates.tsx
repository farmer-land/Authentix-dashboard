'use client';

import { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Clock, FileText, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';


interface RecentTemplate {
  template_id: string;
  template_title: string;
  template_version_id: string | null;
  preview_url: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  fields: Array<{
    id: string;
    field_key: string;
    label: string;
    type: string;
    page_number: number;
    x: number;
    y: number;
    width: number | null;
    height: number | null;
    style: Record<string, unknown> | null;
  }>;
}

interface GeneratedTemplate extends RecentTemplate {
  last_generated_at: string;
  certificates_count: number;
}

interface InProgressTemplate extends RecentTemplate {
  last_modified_at: string;
}

interface RecentUsedTemplatesProps {
  recentGenerated: GeneratedTemplate[];
  inProgress: InProgressTemplate[];
  loading?: boolean;
  onSelectTemplate: (template: RecentTemplate, loadFields: boolean) => void;
}

export function RecentUsedTemplates({
  recentGenerated,
  inProgress,
  loading,
  onSelectTemplate
}: RecentUsedTemplatesProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      const newScroll = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
      scrollContainerRef.current.scrollTo({ left: newScroll, behavior: 'smooth' });
    }
  };

  // Combine in-progress and recent generated
  const allRecent = [
    ...inProgress.map(t => ({ ...t, isInProgress: true, timestamp: t.last_modified_at })),
    ...recentGenerated.map(t => ({ ...t, isInProgress: false, timestamp: t.last_generated_at })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Recent Templates</h3>
        </div>
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-[180px] h-[240px] bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (allRecent.length === 0) {
    return null; // Don't show section if no recent templates
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Recent Templates</h3>
        <Badge variant="secondary" className="text-xs">
          {allRecent.length} template{allRecent.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="relative group/carousel">
        {/* Left Arrow */}
        <Button
          variant="outline"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full opacity-0 group-hover/carousel:opacity-100 disabled:opacity-0 transition-opacity bg-background shadow-md hidden md:flex"
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* Templates Carousel */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scroll-smooth snap-x snap-mandatory"
          style={{ scrollbarWidth: 'thin' }}
        >
          {allRecent.map((template) => (
            <Card
              key={`${template.template_id}-${template.isInProgress ? 'progress' : 'generated'}`}
              className={cn(
                "relative shrink-0 w-[180px] overflow-hidden cursor-pointer transition-all snap-start group",
                "hover:ring-2 hover:ring-primary/50 hover:shadow-lg",
                template.isInProgress && "ring-2 ring-amber-500/50"
              )}
              onClick={() => onSelectTemplate(template, true)}
            >
              {/* In Progress Badge */}
              {template.isInProgress && (
                <div className="absolute top-2 left-2 z-10">
                  <Badge className="bg-amber-500 text-white text-xs flex items-center gap-1">
                    <Play className="w-3 h-3" />
                    Continue
                  </Badge>
                </div>
              )}

              {/* Preview */}
              <div className="h-[140px] bg-muted/50 flex items-center justify-center overflow-hidden">
                {template.preview_url ? (
                  <img
                    src={template.preview_url}
                    alt={template.template_title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <FileText className="w-12 h-12 text-muted-foreground/50" />
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-1">
                <p className="font-medium text-sm truncate" title={template.template_title}>
                  {template.template_title}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">
                    {template.category_name || 'Uncategorized'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(template.timestamp)}</span>
                  {!template.isInProgress && 'certificates_count' in template && (
                    <span>{(template as GeneratedTemplate).certificates_count} certs</span>
                  )}
                </div>
                {template.fields.length > 0 && (
                  <Badge variant="outline" className="text-xs mt-1">
                    {template.fields.length} field{template.fields.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Badge className="bg-primary text-primary-foreground">
                  {template.isInProgress ? 'Continue Designing' : 'Use Template'}
                </Badge>
              </div>
            </Card>
          ))}
        </div>

        {/* Right Arrow */}
        <Button
          variant="outline"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full opacity-0 group-hover/carousel:opacity-100 disabled:opacity-0 transition-opacity bg-background shadow-md hidden md:flex"
          onClick={() => scroll('right')}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
