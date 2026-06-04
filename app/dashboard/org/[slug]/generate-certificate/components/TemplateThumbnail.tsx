'use client';

import { useState } from 'react';

interface TemplateThumbnailProps {
  url: string;
}

export default function TemplateThumbnail({ url }: TemplateThumbnailProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="w-full h-full flex items-center justify-center bg-white relative overflow-hidden pointer-events-none select-none">
      <img
        src={url}
        alt="Template preview"
        className={`w-full h-full object-contain ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={() => setLoading(false)}
        draggable={false}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
