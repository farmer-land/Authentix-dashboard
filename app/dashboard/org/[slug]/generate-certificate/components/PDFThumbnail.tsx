'use client';

import { useState } from 'react';

interface PDFThumbnailProps {
  url: string;
}

export default function PDFThumbnail({ url }: PDFThumbnailProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="w-full h-full flex items-center justify-center bg-white relative overflow-hidden pointer-events-none select-none">
       {/* PDF via native viewer (iframe) */}
       {/* #toolbar=0&navpanes=0 hides UI in supported browsers */}
       <iframe 
         src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
         className={`w-full h-full object-cover border-none ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
         onLoad={() => setLoading(false)}
         title="PDF Preview"
         tabIndex={-1} 
       />
       
       {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
       )}
    </div>
  );
}
