import React, { useId } from 'react';
import { Droplet, Pipette, X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { cn } from '../../../../../utils/cn';
import { t } from '../../../../i18n';

export interface TransparencyColorControlProps {
  /** `#rrggbb` when set; undefined clears keying. */
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  /** Whether the next art click will sample a colour. */
  picking?: boolean;
  onPickingChange?: (picking: boolean) => void;
  /** Compact row for the rail batch tools. */
  className?: string;
  disabled?: boolean;
}

/**
 * Colour keyed to transparent in the token art: picker, clear, and optional
 * pipette that samples the next click on the preview.
 */
export function TransparencyColorControl({
  value,
  onChange,
  picking = false,
  onPickingChange,
  className,
  disabled,
}: TransparencyColorControlProps): React.JSX.Element {
  const labelId = useId();
  const color = value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  const active = Boolean(value);

  return (
    <div className={cn('atlas-token-transparency', className)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className="atlas-token-transparency__label">{t('creator.transparencyColor')}</span>
      <div className="atlas-token-transparency__row">
        <LabelTooltip label={t('creator.transparencyColor')}>
          <span className={cn('atlas-token-transparency__swatch', active && 'atlas-token-transparency__swatch--active')} style={active ? { background: color } : undefined}>
            {!active && <Droplet className="atlas-token-transparency__empty" aria-hidden />}
            <input
              type="color"
              value={color}
              disabled={disabled}
              aria-label={t('creator.transparencyColor')}
              onChange={(e) => onChange(e.target.value)}
            />
          </span>
        </LabelTooltip>
        {onPickingChange && (
          <LabelTooltip label={t('creator.pickTransparencyColor')}>
            <Button
              type="button"
              variant={picking ? 'secondary' : 'outline'}
              size="icon"
              className="atlas-token-transparency__btn"
              disabled={disabled}
              aria-pressed={picking}
              onClick={() => onPickingChange(!picking)}
            >
              <Pipette />
            </Button>
          </LabelTooltip>
        )}
        <LabelTooltip label={t('creator.clearTransparencyColor')}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="atlas-token-transparency__btn"
            disabled={disabled || !active}
            onClick={() => {
              onPickingChange?.(false);
              onChange(undefined);
            }}
          >
            <X />
          </Button>
        </LabelTooltip>
      </div>
    </div>
  );
}
