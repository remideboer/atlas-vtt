import React, { useState } from 'react';
import { t } from '../../i18n';
import type { PaperSize } from '../../player/paperSize';
import { positiveDecimal } from '../../player/playerScreens';

function shown(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** Writes a field when it parses, clears it when it is emptied, and puts a rejected entry back. */
function commitField(
  text: string,
  current: number | undefined,
  restore: (value: string) => void,
  onCommit: (inches: number | undefined) => void,
): void {
  if (text.trim() === '') {
    if (current !== undefined) onCommit(undefined);
    return;
  }
  const parsed = positiveDecimal(text);
  if (parsed === undefined) {
    restore(shown(current));
    return;
  }
  if (parsed !== current) onCommit(parsed);
}

/** A positive entry, a blank axis, or the value already stored when the text does not parse. */
function axisValue(text: string, current: number | undefined): number | undefined {
  if (text.trim() === '') return undefined;
  return positiveDecimal(text) ?? current;
}

/** Width and height in inches. A blank field leaves that axis unset. */
export function PaperSizeFields(props: {
  widthInches: number | undefined;
  heightInches: number | undefined;
  disabled?: boolean;
  onWidth: (inches: number | undefined) => void;
  onHeight: (inches: number | undefined) => void;
  /** The size typed so far, so Apply can be offered before the field is left. */
  onDraft?: (paper: PaperSize) => void;
}): React.JSX.Element {
  const { widthInches, heightInches, disabled, onWidth, onHeight, onDraft } = props;
  const report = (nextWidth: string, nextHeight: string): void => {
    onDraft?.({
      widthInches: axisValue(nextWidth, widthInches),
      heightInches: axisValue(nextHeight, heightInches),
    });
  };
  const [width, setWidth] = useState(shown(widthInches));
  const [height, setHeight] = useState(shown(heightInches));
  const [widthFocused, setWidthFocused] = useState(false);
  const [heightFocused, setHeightFocused] = useState(false);
  const [widthSource, setWidthSource] = useState(widthInches);
  const [heightSource, setHeightSource] = useState(heightInches);
  if (widthInches !== widthSource) {
    setWidthSource(widthInches);
    if (!widthFocused) setWidth(shown(widthInches));
  }
  if (heightInches !== heightSource) {
    setHeightSource(heightInches);
    if (!heightFocused) setHeight(shown(heightInches));
  }

  return (
    <div className="atlas-paper-size">
      <div className="atlas-paper-size__title">{t('align.paperSize')}</div>
      <div className="atlas-paper-size__row">
        <label>
          {t('align.paperWidth')}
          <input
            inputMode="decimal"
            value={width}
            disabled={disabled}
            onFocus={() => setWidthFocused(true)}
            onChange={(event) => {
              const next = event.target.value;
              setWidth(next);
              report(next, height);
            }}
            onBlur={() => {
              setWidthFocused(false);
              commitField(width, widthInches, setWidth, onWidth);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
        <label>
          {t('align.paperHeight')}
          <input
            inputMode="decimal"
            value={height}
            disabled={disabled}
            onFocus={() => setHeightFocused(true)}
            onChange={(event) => {
              const next = event.target.value;
              setHeight(next);
              report(width, next);
            }}
            onBlur={() => {
              setHeightFocused(false);
              commitField(height, heightInches, setHeight, onHeight);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      </div>
    </div>
  );
}
