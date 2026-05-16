'use client';

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, isValid } from 'date-fns';
import { Calendar, Clock, Infinity as InfinityIcon, AlertCircle, ChevronDown, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExpiryType = 'day' | 'week' | 'month' | 'year' | '5_years' | 'never' | 'custom';

interface ExpiryDateSelectorProps {
  value: ExpiryType;
  customDate?: string;
  issueDate?: string;
  onChange: (expiryType: ExpiryType, customDate?: string) => void;
  className?: string;
}

const expiryOptions: { value: ExpiryType; label: string; description: string }[] = [
  { value: 'day', label: '1 Day', description: 'Expires tomorrow' },
  { value: 'week', label: '1 Week', description: 'Expires in 7 days' },
  { value: 'month', label: '1 Month', description: 'Expires in 30 days' },
  { value: 'year', label: '1 Year', description: 'Default expiry period' },
  { value: '5_years', label: '5 Years', description: 'Long-term validity' },
  { value: 'never', label: 'Never', description: 'No expiration' },
  { value: 'custom', label: 'Custom', description: 'Set a specific date' },
];

export function ExpiryDateSelector({
  value,
  customDate,
  issueDate,
  onChange,
  className,
}: ExpiryDateSelectorProps) {
  // Calculate preview expiry date based on current selection
  const getPreviewExpiryDate = (): string | null => {
    const baseDate = issueDate ? new Date(issueDate) : new Date();

    switch (value) {
      case 'day':
        return new Date(baseDate.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString();
      case 'week':
        return new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
      case 'month': {
        const monthDate = new Date(baseDate);
        monthDate.setMonth(monthDate.getMonth() + 1);
        return monthDate.toLocaleDateString();
      }
      case 'year': {
        const yearDate = new Date(baseDate);
        yearDate.setFullYear(yearDate.getFullYear() + 1);
        return yearDate.toLocaleDateString();
      }
      case '5_years': {
        const fiveYearDate = new Date(baseDate);
        fiveYearDate.setFullYear(fiveYearDate.getFullYear() + 5);
        return fiveYearDate.toLocaleDateString();
      }
      case 'never':
        return null;
      case 'custom':
        return customDate ? new Date(customDate).toLocaleDateString() : null;
      default:
        return null;
    }
  };

  const previewDate = getPreviewExpiryDate();

  // Get minimum date for custom date picker (today or issue date)
  const getMinDate = (): string => {
    const today = new Date();
    const base = issueDate ? new Date(issueDate) : today;
    const minDate = base > today ? base : today;
    return minDate.toISOString().split('T')[0]!;
  };

  return (
    <Card className={cn("p-4", className)}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <Label className="text-sm font-medium">Certificate Expiry</Label>
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/50 p-2 rounded-md">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Default: 1 year from issue date. Expired certificates show as &quot;Expired&quot; on verification.</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {expiryOptions.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                value === option.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              )}
              onClick={() => onChange(option.value, customDate)}
            >
              <input
                type="radio"
                name="expiryType"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value, customDate)}
                className="sr-only"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {option.value === 'never' ? (
                    <InfinityIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>

        {/* Custom Date Picker */}
        {value === 'custom' && (
          <div className="pt-3 mt-1 border-t space-y-3">
            <Label className="text-xs font-medium text-foreground block">
              Custom Expiry Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  data-empty={!customDate}
                  className="w-full sm:w-[240px] justify-between font-normal data-[empty=true]:text-muted-foreground"
                >
                  {customDate && isValid(new Date(customDate))
                    ? format(new Date(customDate), 'PPP')
                    : <span>Pick a date</span>}
                  <ChevronDown className="w-4 h-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                <CalendarPicker
                  mode="single"
                  selected={customDate && isValid(new Date(customDate)) ? new Date(customDate) : undefined}
                  onSelect={(d) => onChange('custom', d ? format(d, 'yyyy-MM-dd') : '')}
                  disabled={(date) => date < new Date(getMinDate())}
                  defaultMonth={customDate && isValid(new Date(customDate)) ? new Date(customDate) : undefined}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Preview */}
        {previewDate && (
          <div className="flex items-center gap-2 text-xs pt-2 border-t">
            <span className="text-muted-foreground">Certificates will expire on:</span>
            <span className="font-medium text-foreground">{previewDate}</span>
          </div>
        )}

        {value === 'never' && (
          <div className="flex items-center gap-2 text-xs pt-2 border-t">
            <InfinityIcon className="w-3.5 h-3.5 text-green-600" />
            <span className="text-green-600 font-medium">Certificates will never expire</span>
          </div>
        )}

        {/* DPDP Act 2023 data retention notice */}
        <div className="flex items-start gap-2 text-[11px] pt-2 border-t text-muted-foreground/80">
          <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500/70" />
          <span>
            Under the <strong className="font-medium">DPDP Act 2023</strong>, recipient data (names, emails, custom fields)
            will be permanently deleted
            {value === 'never'
              ? ' when no longer required for certificate verification'
              : previewDate
                ? ` after ${previewDate}`
                : ' after the selected expiry date'
            }. Import data is removed within 7 days of upload.
          </span>
        </div>
      </div>
    </Card>
  );
}
