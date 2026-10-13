import { App, Modal, Notice, Setting } from 'obsidian';
import { t } from '../i18n';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';
import {
  CALIBRATION_INCHES,
  calibrationFactor,
  calibrationSquareCssPixels,
  DIAGONAL_PRESETS,
  pixelsPerInch,
} from './actualSize';
import type { PlayerDisplay } from './playerDisplays';
import { positiveDecimal, type PlayerScreenDraft, type PlayerScreenProfile } from './playerScreens';
import './player-screen.scss';

/** What the screen setup is shown for. */
export interface PlayerScreenPrompt {
  display: PlayerDisplay | null;
  profile: PlayerScreenProfile | null;
  cellInches: number;
  devicePixelRatio: number;
  showSquare(cssPixels: number | null): void;
}

/** The number typed in `input`, or `fallback` when that field is not on the form. */
function fieldValue(input: HTMLInputElement | null, fallback: number | undefined): number | undefined {
  return input ? positiveDecimal(input.value) : fallback;
}

interface ScreenForm {
  diagonal: number | undefined;
  widthMm: number | undefined;
  heightMm: number | undefined;
  widthPx: number | undefined;
  heightPx: number | undefined;
  cellInches: number;
  measured: number | undefined;
}

/** A decimal field, so a comma stays in the value until Apply reads it. */
function fillDecimal(input: HTMLInputElement, value: number | undefined): void {
  input.inputMode = 'decimal';
  if (value !== undefined) input.value = String(value);
}

/**
 * Asks for the player screen's physical size. Resolves with what the GM saved, or null when
 * the dialog is dismissed. The calibration square is taken down when the dialog closes.
 */
export function promptPlayerScreen(app: App, input: PlayerScreenPrompt): Promise<PlayerScreenDraft | null> {
  return new PlayerScreenModal(app, input).openAndWait();
}

class PlayerScreenModal extends Modal {
  private draft: PlayerScreenDraft | null = null;
  private resolveDraft: ((draft: PlayerScreenDraft | null) => void) | null = null;

  constructor(app: App, private readonly input: PlayerScreenPrompt) {
    super(app);
  }

  openAndWait(): Promise<PlayerScreenDraft | null> {
    return new Promise((resolve) => {
      this.resolveDraft = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl, input } = this;
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES);
    this.setTitle(t('player.screenTitle'));

    const profile = input.profile;
    const knownWidth = input.display?.widthPx ?? profile?.widthPx;
    const knownHeight = input.display?.heightPx ?? profile?.heightPx;
    let crisp = profile?.crisp === true;
    let calibration = profile?.calibration ?? 1;
    let diagonalInput: HTMLInputElement | null = null;
    let widthMmInput: HTMLInputElement | null = null;
    let heightMmInput: HTMLInputElement | null = null;
    let widthPxInput: HTMLInputElement | null = null;
    let heightPxInput: HTMLInputElement | null = null;
    let cellInput: HTMLInputElement | null = null;
    let measuredInput: HTMLInputElement | null = null;

    if (input.display) {
      const label = input.display.label || t('player.screenUnnamed');
      contentEl.createEl('p', {
        text: t('player.screenDetected', { label, width: input.display.widthPx, height: input.display.heightPx }),
      });
    }

    const diagonalSetting = new Setting(contentEl)
      .setName(t('player.screenDiagonal'))
      .setDesc(t('player.screenDiagonalHint'));
    diagonalSetting.addText((text) => {
      diagonalInput = text.inputEl;
      fillDecimal(text.inputEl, profile?.diagonalInches);
    });

    const presets = contentEl.createDiv({ cls: 'atlas-player-screen-presets' });
    for (const inches of DIAGONAL_PRESETS) {
      const preset = presets.createEl('button', { text: String(inches) });
      preset.type = 'button';
      preset.addEventListener('click', () => {
        if (diagonalInput) diagonalInput.value = String(inches);
      });
    }

    if (!input.display) {
      new Setting(contentEl).setName(t('player.screenWidthPx')).setDesc(t('player.screenPixels')).addText((text) => {
        widthPxInput = text.inputEl;
        fillDecimal(text.inputEl, knownWidth);
      });
      new Setting(contentEl).setName(t('player.screenHeightPx')).addText((text) => {
        heightPxInput = text.inputEl;
        fillDecimal(text.inputEl, knownHeight);
      });
    }

    new Setting(contentEl).setName(t('player.screenWidthMm')).setDesc(t('player.screenMmHint')).addText((text) => {
      widthMmInput = text.inputEl;
      fillDecimal(text.inputEl, profile?.widthMm);
    });
    new Setting(contentEl).setName(t('player.screenHeightMm')).addText((text) => {
      heightMmInput = text.inputEl;
      fillDecimal(text.inputEl, profile?.heightMm);
    });
    new Setting(contentEl).setName(t('player.screenCell')).setDesc(t('player.screenCellHint')).addText((text) => {
      cellInput = text.inputEl;
      fillDecimal(text.inputEl, input.cellInches);
    });
    new Setting(contentEl).setName(t('player.screenCrisp')).setDesc(t('player.screenCrispHint')).addToggle((toggle) => {
      toggle.setValue(crisp).onChange((value) => { crisp = value; });
    });

    // Buttons read the inputs here. Obsidian reports a text change on blur, so a click on Apply
    // would otherwise still see the fields as empty.
    const read = (): ScreenForm => ({
      diagonal: fieldValue(diagonalInput, undefined),
      widthMm: fieldValue(widthMmInput, undefined),
      heightMm: fieldValue(heightMmInput, undefined),
      widthPx: fieldValue(widthPxInput, knownWidth),
      heightPx: fieldValue(heightPxInput, knownHeight),
      cellInches: fieldValue(cellInput, input.cellInches) ?? input.cellInches,
      measured: measuredInput ? positiveDecimal(measuredInput.value) : undefined,
    });
    const ppiOf = (form: ScreenForm): number | null => {
      if (form.widthPx === undefined || form.heightPx === undefined) return null;
      return pixelsPerInch({
        widthPx: form.widthPx,
        heightPx: form.heightPx,
        ...(form.diagonal !== undefined ? { diagonalInches: form.diagonal } : {}),
        ...(form.widthMm !== undefined ? { widthMm: form.widthMm } : {}),
        ...(form.heightMm !== undefined ? { heightMm: form.heightMm } : {}),
        calibration,
      });
    };
    const showSquare = (): void => {
      const ppi = ppiOf(read());
      const css = ppi === null ? null : calibrationSquareCssPixels(CALIBRATION_INCHES, ppi, input.devicePixelRatio || 1);
      if (css === null) {
        new Notice(t('player.screenNoSize'));
        input.showSquare(null);
        return;
      }
      input.showSquare(css);
    };

    new Setting(contentEl)
      .setName(t('player.screenCalibrate'))
      .setDesc(t('player.screenCalibrateHint'))
      .addText((text) => {
        measuredInput = text.inputEl;
        text.inputEl.inputMode = 'decimal';
        text.setPlaceholder(String(CALIBRATION_INCHES));
      })
      .addButton((button) => button.setButtonText(t('player.screenShowSquare')).onClick(showSquare))
      .addButton((button) => button.setButtonText(t('player.screenApplyMeasure')).onClick(() => {
        const form = read();
        if (ppiOf(form) === null) {
          new Notice(t('player.screenNoSize'));
          return;
        }
        const factor = form.measured === undefined ? null : calibrationFactor(CALIBRATION_INCHES, form.measured);
        if (factor === null) {
          new Notice(t('player.screenNoMeasure'));
          return;
        }
        calibration *= factor;
        if (measuredInput) measuredInput.value = '';
        showSquare();
      }));

    const actions = contentEl.createDiv({ cls: 'modal-button-container' });
    const save = actions.createEl('button', { text: t('player.screenSave'), cls: 'mod-cta' });
    save.type = 'button';
    save.addEventListener('click', () => {
      const form = read();
      const factor = form.measured === undefined ? null : calibrationFactor(CALIBRATION_INCHES, form.measured);
      if (factor !== null) calibration *= factor;
      if (form.widthPx === undefined || form.heightPx === undefined || ppiOf(form) === null) {
        new Notice(t('player.screenNoSize'));
        return;
      }
      const saved: PlayerScreenDraft = { cellInches: form.cellInches, crisp, calibration, widthPx: form.widthPx, heightPx: form.heightPx };
      if (form.diagonal !== undefined) saved.diagonalInches = form.diagonal;
      if (form.widthMm !== undefined) saved.widthMm = form.widthMm;
      if (form.heightMm !== undefined) saved.heightMm = form.heightMm;
      if (input.display?.label) saved.label = input.display.label;
      this.draft = saved;
      this.close();
    });
    const cancel = actions.createEl('button', { text: t('common.cancel') });
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.input.showSquare(null);
    this.contentEl.empty();
    this.resolveDraft?.(this.draft);
    this.resolveDraft = null;
  }
}
