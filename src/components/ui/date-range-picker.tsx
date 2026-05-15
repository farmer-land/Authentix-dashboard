"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DatePickerWithRangeProps {
  date?: DateRange | undefined
  onDateChange: (date: DateRange | undefined) => void
  /** Applied to the outer `Field` (default matches shadcn example: `mx-auto w-60`) */
  className?: string
  id?: string
  label?: string
  /** Popover alignment relative to trigger. Use "end" when trigger is on the right side of the screen. */
  align?: "start" | "center" | "end"
}

export function DatePickerWithRange({
  date,
  onDateChange,
  className = "mx-auto w-60",
  id = "date-picker-range",
  label = "Date Picker Range",
  align = "start",
}: DatePickerWithRangeProps) {
  return (
    <Field className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id={id}
            className="justify-start px-2.5 font-normal"
          >
            <CalendarIcon />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onDateChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </Field>
  )
}
