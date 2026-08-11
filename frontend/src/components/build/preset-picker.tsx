import type { FC } from "react";
import { PRESETS, type PresetId } from "@/lib/strategy";

interface PresetPickerProps {
  active: PresetId | null;
  disabled: boolean;
  onPick: (id: PresetId) => void;
}

export const PresetPicker: FC<PresetPickerProps> = ({ active, disabled, onPick }) => (
  <div className="flex flex-wrap gap-1.5">
    {PRESETS.map((preset) => {
      const isActive = preset.id === active;
      return (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPick(preset.id)}
          disabled={disabled}
          aria-pressed={isActive}
          // the summary is a tooltip, not the button's name. as a bare title it
          // replaces the accessible name, so a screen reader announces the
          // description instead of which preset this is.
          title={preset.summary}
          aria-label={preset.label}
          className={`cursor-pointer rounded-sm border px-2.5 py-1.5 text-xs transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 ${
            isActive
              ? "border-accent-dim bg-accent-glow text-accent"
              : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {preset.label}
        </button>
      );
    })}
  </div>
);
