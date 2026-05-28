'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Image as ImageIcon, Stamp, PenTool, Upload, Plus, Trash2, MousePointerClick } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api/client';

export interface Asset {
  id: string;
  name: string;
  url: string;
  type: 'logo' | 'signature' | 'stamp';
}

interface AssetLibraryProps {
  assets: Asset[];
  onAssetsChange: (assets: Asset[] | ((prev: Asset[]) => Asset[])) => void;
  onAddAsset: (url: string, name: string) => void;
}

const ASSET_TYPES = [
  { id: 'logo' as const, label: 'Logos', icon: ImageIcon },
  { id: 'signature' as const, label: 'Signatures', icon: PenTool },
  { id: 'stamp' as const, label: 'Stamps', icon: Stamp },
];

export function AssetLibrary({ assets, onAssetsChange, onAddAsset }: AssetLibraryProps) {
  const [activeType, setActiveType] = useState<'logo' | 'signature' | 'stamp'>('logo');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [assetName, setAssetName] = useState('');
  const [, setIsUploading] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        setUploadFile(file);
        setAssetName(file.name.replace(/\.(png|jpg|jpeg|svg|webp)$/i, ''));
      }
    },
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp'] },
    maxFiles: 1,
    noClick: false,
  });

  const handleUpload = async () => {
    if (!uploadFile || !assetName.trim()) return;
    setIsUploading(true);
    // Optimistic entry with blob URL
    const blobUrl = URL.createObjectURL(uploadFile);
    const tempId = Math.random().toString(36).slice(2);
    const tempAsset: Asset = { id: tempId, name: assetName.trim(), url: blobUrl, type: activeType };
    onAssetsChange([...assets, tempAsset]);
    setShowUploadDialog(false);
    setUploadFile(null);
    setAssetName('');
    try {
      const permanentUrl = await api.templates.uploadAsset(uploadFile);
      URL.revokeObjectURL(blobUrl);
      // Replace blob URL with permanent URL
      onAssetsChange(prev => prev.map(a => a.id === tempId ? { ...a, url: permanentUrl } : a));
    } catch (err) {
      console.error('[AssetLibrary] Upload failed:', err);
      // Keep blob URL (works for current session)
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    onAssetsChange(assets.filter((a) => a.id !== id));
  };

  const filteredAssets = assets.filter((a) => a.type === activeType);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Asset Library</p>
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors">
              <Plus className="w-3 h-3" />
              Add Asset
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload {activeType.charAt(0).toUpperCase() + activeType.slice(1)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-2">
                  {uploadFile ? (
                    <>
                      <img src={URL.createObjectURL(uploadFile)} alt="Preview" className="max-w-full max-h-32 object-contain rounded" />
                      <p className="text-sm font-medium">{uploadFile.name}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Drag & drop or click to upload</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, SVG, WebP</p>
                    </>
                  )}
                </div>
              </div>
              {uploadFile && (
                <div className="space-y-2">
                  <Label htmlFor="assetName">Name</Label>
                  <Input id="assetName" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g., Company Logo" />
                </div>
              )}
              <Button onClick={handleUpload} disabled={!uploadFile || !assetName.trim()} className="w-full">
                Add to Library
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Type tabs */}
      <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
        {ASSET_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-medium py-1 rounded-md transition-all ${
              activeType === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      {filteredAssets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          {(() => { const T = ASSET_TYPES.find(t => t.id === activeType)!; return <T.icon className="w-7 h-7 text-muted-foreground/40" />; })()}
          <p className="text-xs text-muted-foreground">No {activeType}s yet</p>
          <p className="text-[10px] text-muted-foreground/60">Upload one to add it to your certificate</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="group relative rounded-lg border border-border/50 bg-card overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('asset-url', asset.url);
                e.dataTransfer.setData('asset-name', asset.name);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAddAsset(asset.url, asset.name)}
              title={`Click or drag to add "${asset.name}"`}
            >
              <div className="aspect-square bg-muted/50 flex items-center justify-center p-3">
                <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain" draggable={false} />
              </div>
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <div className="bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg">
                  <MousePointerClick className="w-3 h-3" />
                </div>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[10px] font-medium truncate text-foreground">{asset.name}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                className="absolute top-1 right-1 p-1 rounded bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {filteredAssets.length > 0 && (
        <p className="text-[9px] text-muted-foreground/50 text-center">Click or drag assets onto the template</p>
      )}
    </div>
  );
}
