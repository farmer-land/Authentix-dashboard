'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  FileSpreadsheet,
  Edit2,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { ImportedData } from '@/lib/types/certificate';
import { cn } from '@/lib/utils';

interface DataPreviewProps {
  data: ImportedData;
  onRowEdit?: (rowIndex: number, row: Record<string, unknown>) => void;
  onRowDelete?: (rowIndex: number) => void;
  className?: string;
  maxHeight?: string;
}

const PAGE_SIZE = 10;

export function DataPreview({
  data,
  onRowEdit,
  onRowDelete,
  className,
  maxHeight = '400px',
}: DataPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter rows based on search
  const filteredRows = data.rows.filter((row) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return data.headers.some((header) => {
      const value = row[header];
      return value?.toString().toLowerCase().includes(searchLower);
    });
  });

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  // Reset to first page when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Check for empty/missing values
  const hasEmptyValues = (row: Record<string, unknown>): boolean => {
    return data.headers.some((header) => {
      const value = row[header];
      return value === undefined || value === null || value === '';
    });
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{data.fileName}</h3>
            <p className="text-xs text-muted-foreground">
              {data.rowCount} recipient{data.rowCount !== 1 ? 's' : ''} &bull;{' '}
              {data.headers.length} column{data.headers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search data..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background z-10 border-b">
            <tr>
              <th className="w-12 px-4 py-3 text-center font-medium text-muted-foreground">#</th>
              {data.headers.map((header) => (
                <th key={header} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {header}
                </th>
              ))}
              {(onRowEdit || onRowDelete) && (
                <th className="w-20 px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={data.headers.length + 2} className="text-center py-8 px-4">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No matching results found' : 'No data available'}
                  </p>
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const globalIndex = startIndex + idx;
                const hasEmpty = hasEmptyValues(row);

                return (
                  <tr
                    key={globalIndex}
                    className={cn(
                      'border-b hover:bg-muted/30',
                      hasEmpty && 'bg-yellow-50/50 dark:bg-yellow-950/20'
                    )}
                  >
                    <td className="px-4 py-3 text-center text-muted-foreground font-mono text-xs">
                      {globalIndex + 1}
                    </td>
                    {data.headers.map((header) => {
                      const value = row[header];
                      const isEmpty = value === undefined || value === null || value === '';

                      return (
                        <td
                          key={header}
                          className={cn(
                            'px-4 py-3 whitespace-nowrap max-w-[200px] truncate',
                            isEmpty && 'text-muted-foreground italic'
                          )}
                          title={value?.toString() || ''}
                        >
                          {isEmpty ? (
                            <span className="text-xs">(empty)</span>
                          ) : (
                            value?.toString()
                          )}
                        </td>
                      );
                    })}
                    {(onRowEdit || onRowDelete) && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onRowEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onRowEdit(globalIndex, row)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {onRowDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => onRowDelete(globalIndex)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with pagination */}
      <div className="flex items-center justify-between p-3 border-t bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {filteredRows.length > 0 ? startIndex + 1 : 0}–{Math.min(endIndex, filteredRows.length)}
            {searchTerm
              ? ` of ${filteredRows.length} results (searched ${data.rows.length.toLocaleString()} loaded rows)`
              : data.rowCount > data.rows.length
                ? ` of ${data.rows.length} preview rows · ${data.rowCount.toLocaleString()} total`
                : ` of ${filteredRows.length}`}
          </p>
          {data.rowCount > data.rows.length && !searchTerm && (
            <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
              Preview only — all {data.rowCount.toLocaleString()} rows used for generation
            </Badge>
          )}
          {filteredRows.some(hasEmptyValues) && (
            <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-300">
              <AlertCircle className="w-3 h-3" />
              Some rows have empty values
            </Badge>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-2 min-w-[60px] text-center">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
