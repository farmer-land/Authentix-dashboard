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
  Hash, Building2, Award, TrendingUp, Clock, UserCheck,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface FieldTypeSelectorProps {
  onAddField: (field: CertificateField) => void;
  onAddImageField?: (url: string, name: string) => void;
  onAddImageFile?: (file: File) => void;
  pdfWidth: number;
  pdfHeight: number;
}

const FIELD_ICONS: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  name: User,
  course: BookOpen,
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
};

const FIELD_GROUPS: { label: string; types: FieldType[] }[] = [
  {
    label: 'Recipient',
    types: ['name', 'grade', 'level'],
  },
  {
    label: 'Course',
    types: ['course', 'duration', 'start_date', 'end_date'],
  },
  {
    label: 'Certificate',
    types: ['credential_id', 'organization', 'issuer', 'custom_text'],
  },
  {
    label: 'Media',
    types: ['qr_code', 'image'],
  },
];

const REF_WIDTH = 595;
const REF_HEIGHT = 842;

export function FieldTypeSelector({ onAddField, onAddImageField, onAddImageFile, pdfWidth, pdfHeight }: FieldTypeSelectorProps) {
  const [showCustomNameDialog, setShowCustomNameDialog] = useState(false);
  const [customFieldName, setCustomFieldName] = useState('');
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

    if (type === 'start_date' || type === 'end_date') {
      field.dateFormat = 'MMMM dd, yyyy';
    }

    onAddField(field);
  };

  const handleFieldClick = (type: FieldType) => {
    if (type === 'custom_text') {
      setCustomFieldName('');
      setShowCustomNameDialog(true);
    } else if (type === 'image' && (onAddImageFile || onAddImageField)) {
      fileInputRef.current?.click();
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
      onAddImageField?.(url, file.name);
    }
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
    </>
  );
}
