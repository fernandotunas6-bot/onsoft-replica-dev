import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ColorPickerProps {
  label: string;
  cssVar: string;
  value: string;
  onChange: (cssVar: string, value: string) => void;
}

export function ColorPicker({ label, cssVar, value, onChange }: ColorPickerProps) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setLocalValue(newColor);
    onChange(cssVar, newColor);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(cssVar, newValue);
  };

  // Get current computed color for display
  const displayColor = React.useMemo(() => {
    if (localValue && (localValue.startsWith("#") || localValue.startsWith("rgb") || localValue.startsWith("hsl") || localValue.startsWith("oklch"))) {
      return localValue;
    }

    if (typeof window !== "undefined") {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      if (computed) {
        return computed;
      }
    }

    return "#6366f1";
  }, [localValue, cssVar]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`color-${cssVar}`} className="text-xs font-medium text-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 p-0 rounded-lg overflow-hidden cursor-pointer border border-border shadow-xs"
            style={{ backgroundColor: displayColor }}
          >
            <input
              type="color"
              id={`color-${cssVar}`}
              value={displayColor.startsWith("#") ? displayColor : "#6366f1"}
              onChange={handleColorChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </Button>
        </div>
        <Input
          type="text"
          placeholder={`${cssVar} valor (ex: #3b82f6 ou oklch(...))`}
          value={localValue}
          onChange={handleTextChange}
          className="h-8 text-xs font-mono flex-1"
        />
      </div>
    </div>
  );
}
