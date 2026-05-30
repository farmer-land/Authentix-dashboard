'use client';

import { useState, useRef } from 'react';
import { CertificateField, FieldType, FIELD_TYPE_CONFIG } from '@/lib/types/certificate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  User, BookOpen, Calendar, Type, QrCode, Image as ImageIcon,
  Hash, Building2, Award, TrendingUp, Clock, UserCheck, Upload, MapPin,
  PenLine, Stamp, BadgeCheck,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface FieldTypeSelectorProps {
  onAddField: (field: CertificateField) => void;
  onAddImageField?: (url: string, name: string) => void;
  onAddImageFile?: (file: File) => void;
  pdfWidth: number;
  pdfHeight: number;
  orgLogoUrl?: string | null;
}

const FIELD_ICONS: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  name: User,
  course: BookOpen,
  date: Calendar,
  start_date: Calendar,
  end_date: Calendar,
  custom_text: Type,
  qr_code: QrCode,
  image: ImageIcon,
  credential_id: Hash,
  organization: Building2,
  grade: Award,
  level: TrendingUp,
  duration: Clock,
  issuer: UserCheck,
  place: MapPin,
};

const FIELD_GROUPS: { label: string; types: FieldType[] }[] = [
  {
    label: 'Recipient',
    types: ['name', 'grade', 'level'],
  },
  {
    label: 'Course',
    types: ['course', 'duration', 'date', 'start_date', 'end_date'],
  },
  {
    label: 'Certificate',
    types: ['credential_id', 'organization', 'issuer', 'place', 'custom_text'],
  },
  {
    label: 'Media',
    types: ['qr_code', 'image'],
  },
];

const REF_WIDTH = 595;
const REF_HEIGHT = 842;

export function FieldTypeSelector({ onAddField, onAddImageField, onAddImageFile, pdfWidth, pdfHeight, orgLogoUrl }: FieldTypeSelectorProps) {
  const [showCustomNameDialog, setShowCustomNameDialog] = useState(false);
  const [customFieldName, setCustomFieldName] = useState('');
  const [showImagePickerDialog, setShowImagePickerDialog] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createField = (type: FieldType, customLabel?: string) => {
    const config = FIELD_TYPE_CONFIG[type];
    const wScale = pdfWidth > 0 ? pdfWidth / REF_WIDTH : 1;
    const hScale = pdfHeight > 0 ? pdfHeight / REF_HEIGHT : 1;
    const scaledWidth = Math.round(config.defaultWidth * wScale);
    const scaledHeight = Math.round(config.defaultHeight * hScale);
    const x = (pdfWidth - scaledWidth) / 2;
    const y = (pdfHeight - scaledHeight) / 2;
    const label = customLabel || config.label;

    const field: CertificateField = {
      id: uuidv4(),
      type,
      label,
      x,
      y,
      width: scaledWidth,
      height: scaledHeight,
      fontSize: type === 'qr_code' ? 0 : Math.max(12, Math.round(24 * hScale)),
      fontFamily: 'DM Sans',
      color: '#000000',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'center',
      sampleValue: customLabel || config.sampleValue,
    };

    if (type === 'date' || type === 'start_date' || type === 'end_date') {
      field.dateFormat = 'MMMM dd, yyyy';
    }

    onAddField(field);
  };

  const openFilePicker = (label?: string) => {
    setPendingLabel(label ?? null);
    setShowImagePickerDialog(false);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const handleFieldClick = (type: FieldType) => {
    if (type === 'custom_text') {
      setCustomFieldName('');
      setShowCustomNameDialog(true);
    } else if (type === 'image' && (onAddImageFile || onAddImageField)) {
      setShowImagePickerDialog(true);
    } else {
      createField(type);
    }
  };

  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onAddImageFile) {
      onAddImageFile(file);
    } else {
      const url = URL.createObjectURL(file);
      onAddImageField?.(url, pendingLabel ?? file.name);
    }
    setPendingLabel(null);
    e.target.value = '';
  };

  const handleCreateCustomField = () => {
    const name = customFieldName.trim() || 'Custom Text';
    createField('custom_text', name);
    setShowCustomNameDialog(false);
    setCustomFieldName('');
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileSelected}
      />

      <div className="space-y-3">
        {FIELD_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1.5 px-0.5 select-none">
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {group.types.map((type) => {
                const Icon = FIELD_ICONS[type];
                const config = FIELD_TYPE_CONFIG[type];
                return (
                  <Button
                    key={type}
                    variant="outline"
                    className="h-auto flex-col gap-1.5 py-2.5 text-left items-start px-3 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    onClick={() => handleFieldClick(type)}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                    <span className="text-[10px] leading-tight text-left">{config.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showCustomNameDialog} onOpenChange={setShowCustomNameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Text Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fieldName">Field Label</Label>
              <Input
                id="fieldName"
                value={customFieldName}
                onChange={(e) => setCustomFieldName(e.target.value)}
                placeholder="e.g., Certificate Number, Department, Batch ID"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCustomField(); }}
              />
              <p className="text-xs text-muted-foreground">
                This label appears in field mapping and on the canvas.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomNameDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomField}>Add Field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImagePickerDialog} onOpenChange={setShowImagePickerDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Add to canvas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">

            {/* Org logo shortcut */}
            {orgLogoUrl && (
              <>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-0.5">From library</p>
                <button
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                  onClick={() => { onAddImageField?.(orgLogoUrl, 'Organization Logo'); setShowImagePickerDialog(false); }}
                >
                  <img src={orgLogoUrl} alt="" className="w-10 h-10 object-contain rounded shrink-0 bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div>
                    <p className="text-sm font-medium">Organization logo</p>
                    <p className="text-xs text-muted-foreground">Use your uploaded logo</p>
                  </div>
                </button>
              </>
            )}

            {/* Upload options */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-0.5">Upload</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: 'Image', icon: ImageIcon, desc: 'Any image' },
                { label: 'Signature', icon: PenLine, desc: 'Author sign-off' },
                { label: 'Stamp', icon: Stamp, desc: 'Official seal' },
                { label: 'Badge', icon: BadgeCheck, desc: 'Achievement badge' },
              ] as const).map(({ label, icon: Icon, desc }) => (
                <button
                  key={label}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-center"
                  onClick={() => openFilePicker(label === 'Image' ? undefined : label)}
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-medium leading-none">{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
